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
    // "Other" cannot be expressed as a positive country list — it is the COMPLEMENT of
    // every defined region, and the set of countries in the data is open-ended. Callers
    // must use excludedCountriesForRegion() with a negated predicate instead. Returning
    // [] here is deliberate and is what isExclusionRegion() keys off.
    return [];
  }
  return REGIONS[region] ?? [];
}

/**
 * Every country code that belongs to at least one defined region.
 *
 * This is the exclusion set for "Other": a country is in the Other bucket precisely
 * when it is NOT in this list.
 */
export const ALL_REGION_COUNTRIES: string[] = Array.from(
  new Set(Object.values(REGIONS).flat()),
).sort();

/**
 * True when a region must be queried as a NEGATION rather than as an `IN (...)` list.
 *
 * Only "Other" behaves this way. This exists because the previous code path silently
 * degraded: countriesForRegion("Other") returned [], the caller skipped its `.in()`
 * filter entirely, and the query returned EVERY region's rows instead of the Other
 * bucket — leaving 785 Established HCPs across 32 countries unreachable through the
 * filter that was supposed to select them.
 */
export function isExclusionRegion(region: RegionKey): boolean {
  return region === "Other";
}

/**
 * Country codes to EXCLUDE when querying an exclusion region. Pair with a negated
 * predicate (`.not("scope_value", "in", ...)`), never with `.in()`.
 */
export function excludedCountriesForRegion(region: RegionKey): string[] {
  return isExclusionRegion(region) ? ALL_REGION_COUNTRIES : [];
}
