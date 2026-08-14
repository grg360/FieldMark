/**
 * Location display — the single place that decides how a location is allowed to be
 * shown, given how much we actually know about it.
 *
 * Background: `hcps_v2.country` is a historical all-time plurality frozen at HCP
 * creation. The 2026-08-14 re-derivation added `current_country` alongside it (the
 * original is preserved, never overwritten) plus `affiliation_confidence` and
 * `affiliation_as_of`. See docs/AFFILIATION_REDERIVATION_STEP_3_RESULTS.md.
 *
 * Only ~10% of the re-derived country corrections are high-confidence; the rest rest
 * on one or two papers. So a location is NOT allowed to render as plainly current
 * unless the evidence says so — anything less is hedged with the year it comes from.
 *
 * ABSENCE DISCIPLINE: when there is no location, callers render a NAMED absence
 * ("LOCATION UNKNOWN"), never a blank and never a fabricated default. HCPCard used to
 * print `country ?? "US"`, which asserted "US" for every HCP with no country on file.
 */

export type AffiliationConfidence = "high" | "medium" | "stale" | "unknown";

export interface LocationInput {
  /** Historical, preserved: hcps_v2.country */
  country?: string | null;
  /** Re-derived from recent publications: hcps_v2.current_country */
  currentCountry?: string | null;
  affiliationConfidence?: string | null;
  /** Year the winning evidence actually comes from: hcps_v2.affiliation_as_of */
  affiliationAsOf?: number | null;
}

export interface LocationDisplay {
  /** Uppercased country code, or null when we genuinely have none. */
  code: string | null;
  /** True when there is no location at all — render a named absence. */
  absent: boolean;
  /** True when the code must not be presented as confidently current. */
  hedged: boolean;
  /** Year to show alongside a hedged code, when known. */
  asOf: number | null;
  /** Ready-to-render label. "US", "US · 2024", or the absence phrase. */
  label: string;
  /** Longer form for tooltips / title attributes. */
  title: string;
  confidence: AffiliationConfidence;
}

export const LOCATION_ABSENT_LABEL = "LOCATION UNKNOWN";

function normConfidence(raw?: string | null): AffiliationConfidence {
  switch ((raw ?? "").toLowerCase()) {
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "stale":
      return "stale";
    default:
      return "unknown";
  }
}

function normCode(raw?: string | null): string | null {
  const t = (raw ?? "").trim();
  return t === "" ? null : t.toUpperCase();
}

/**
 * Resolve a location for display.
 *
 * Prefers `current_country` when present, falling back to the preserved historical
 * `country`. A fallback to the historical value is always treated as hedged, because
 * that value carries no recency evidence at all.
 */
export function resolveLocation(input: LocationInput): LocationDisplay {
  const confidence = normConfidence(input.affiliationConfidence);
  const current = normCode(input.currentCountry);
  const historical = normCode(input.country);
  const asOf = typeof input.affiliationAsOf === "number" ? input.affiliationAsOf : null;

  const code = current ?? historical;

  if (!code) {
    return {
      code: null,
      absent: true,
      hedged: false,
      asOf: null,
      label: LOCATION_ABSENT_LABEL,
      title: "No location on record for this HCP.",
      confidence: "unknown",
    };
  }

  // Only a high-confidence re-derived value earns a plain, unqualified render.
  const plain = current != null && confidence === "high";
  if (plain) {
    return {
      code,
      absent: false,
      hedged: false,
      asOf,
      label: code,
      title: asOf ? `Current location, confirmed by publications through ${asOf}.` : "Current location.",
      confidence,
    };
  }

  const label = asOf ? `${code} · ${asOf}` : code;
  const title =
    confidence === "stale"
      ? `Last known location${asOf ? ` as of ${asOf}` : ""} — no recent publications.`
      : current != null
        ? `Location as of ${asOf ?? "an earlier year"} — limited recent evidence.`
        : "Historical location; not confirmed against recent publications.";

  return { code, absent: false, hedged: true, asOf, label, title, confidence };
}
