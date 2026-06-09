/**
 * Regional taxonomy for FieldMark.
 *
 * Each region maps to a list of ISO 3166-1 alpha-2 country codes.
 * HCPs are bucketed into regions based on their `country` field in hcps_v2.
 *
 * Notes:
 * - GB intentionally appears in both EU5 (commercial shorthand) and UK (post-Brexit standalone).
 * - "Other" is the catch-all for countries not in any defined region.
 * - "Global" is not a region for filtering; it's the no-filter view.
 * - HCPs with country=NULL are only visible in the Global view.
 *
 * MSL territory regions (northeast, southeast, etc.) live separately in FilterContext
 * as `userTerritory` + US state codes — not as RegionKey values.
 */

export type RegionKey = "US" | "EU5" | "EU" | "UK" | "APAC" | "LATAM" | "MENA" | "Other" | "Global";

export const REGIONS: Record<Exclude<RegionKey, "Global" | "Other">, string[]> = {
  US: ["US"],
  EU5: ["DE", "FR", "IT", "ES", "GB"],
  EU: [
    "DE", "FR", "IT", "ES", "NL", "BE", "AT", "IE", "PT",
    "SE", "DK", "FI", "PL", "CZ", "HU", "GR", "RO", "BG",
    "SK", "SI", "HR", "EE", "LV", "LT", "LU", "MT", "CY"
  ],
  UK: ["GB"],
  APAC: ["JP", "KR", "CN", "TW", "HK", "AU", "NZ", "SG", "IN", "TH", "MY", "ID", "PH", "VN"],
  LATAM: ["BR", "MX", "AR", "CL", "CO", "PE", "VE"],
  MENA: ["EG", "SA", "AE", "IL", "TR", "IR", "MA", "JO", "LB"],
};

export const REGION_DISPLAY_NAMES: Record<RegionKey, string> = {
  US: "United States",
  EU5: "EU5 (DE/FR/IT/ES/UK)",
  EU: "European Union",
  UK: "United Kingdom",
  APAC: "Asia-Pacific",
  LATAM: "Latin America",
  MENA: "Middle East & North Africa",
  Other: "Other",
  Global: "Global",
};

export const REGION_ORDER: RegionKey[] = [
  "US", "EU5", "EU", "UK", "APAC", "LATAM", "MENA", "Other", "Global",
];

export const DEFAULT_REGION: RegionKey = "US";

/**
 * Given a country code, return the regions that country belongs to.
 * A country can belong to multiple regions (e.g., GB → EU5 and UK).
 */
export function regionsForCountry(country: string | null | undefined): RegionKey[] {
  if (!country) return ["Global"];
  const upper = country.toUpperCase();
  const matched: RegionKey[] = [];
  for (const [region, countries] of Object.entries(REGIONS)) {
    if (countries.includes(upper)) {
      matched.push(region as RegionKey);
    }
  }
  if (matched.length === 0) return ["Other", "Global"];
  return [...matched, "Global"];
}

/**
 * Given a region key, return the list of countries that belong to it.
 * Returns null for "Global" (meaning "no country filter").
 */
export function countriesForRegion(region: RegionKey): string[] | null {
  if (region === "Global") return null;
  if (region === "Other") {
    // Other = "not in any defined region". Caller must filter accordingly.
    return [];
  }
  return REGIONS[region] ?? [];
}
