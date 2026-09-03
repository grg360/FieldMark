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

/** Shown when neither an NPPES state nor an institution state nor a country exists. */
export const PRACTICE_STATE_ABSENT_LABEL = "LOCATION NOT ESTABLISHED";

export type StateBasis = "nppes" | "institution" | null;

export interface PracticeStateInput {
  /** hcps_v2.nppes_practice_state — a practice registration. Only this is a claim
   *  about where the person WORKS. */
  nppesPracticeState?: string | null;
  /** hcps_v2.derived_state — also NPPES-sourced; 0.4% populated, kept for the rows
   *  that have it. Treated as the same tier as nppesPracticeState. */
  derivedState?: string | null;
  /** hcps_v2.institution_state — where their INSTITUTION is. Not a practice location. */
  institutionState?: string | null;
  /** hcps_v2.institution_state_source — 'institution_ror_confirmed' | 'legacy_nppes_column' */
  institutionStateSource?: string | null;
}

export interface PracticeStateDisplay {
  /** The bare code, for comparisons and filters. Never carries the qualifier. */
  code: string | null;
  basis: StateBasis;
  /** Ready-to-render: "TX", "TX · INSTITUTION", or "" when there is no state at all.
   *  Empty rather than the absence phrase, because most callers fall back to a country
   *  before giving up — see PRACTICE_STATE_ABSENT_LABEL for the end of that chain. */
  label: string;
}

/**
 * THE ONLY PLACE A PRACTICE STATE IS TURNED INTO A DISPLAY STRING.
 *
 * A CALL SITE THAT FORMATS ITS OWN LOCATION IS A DEFECT. Five sites read these columns
 * and, before this function, each would have grown its own qualifier — which is precisely
 * how one therapeutic-area tag became four different spellings across four call sites and
 * put eight EGFR-mutant lung papers under a colorectal heading. One formatter, or they
 * drift; there is no third outcome.
 *
 * WHY THE QUALIFIER IS NOT OPTIONAL. hcps_v2 carried 14,678 rows whose
 * nppes_practice_state held an INSTITUTION's state (Northwestern IL, Johns Hopkins MD)
 * with no NPI behind it, and every surface displayed those as practice locations and
 * filtered territory by them. The 2026-09-02 split moved them to institution_state. The
 * split is only worth anything if the difference REACHES THE READER: a silent
 * `nppesPracticeState ?? institutionState` is the original defect with extra steps.
 *
 * `code` is deliberately separate from `label`. Anything comparing a state to a code —
 * a filter, a territory test, a group-by — uses `code`; only rendering uses `label`.
 * Gluing "· INSTITUTION" onto the value would break the former and cannot be parsed back.
 */
export function resolvePracticeState(input: PracticeStateInput): PracticeStateDisplay {
  const nppes = (input.nppesPracticeState ?? input.derivedState ?? "").trim().toUpperCase();
  if (nppes) return { code: nppes, basis: "nppes", label: nppes };

  const institution = (input.institutionState ?? "").trim().toUpperCase();
  if (institution) {
    return { code: institution, basis: "institution", label: `${institution} · INSTITUTION` };
  }
  return { code: null, basis: null, label: "" };
}

/**
 * The profile's sentence, not a chip suffix. Returns null when nothing needs saying.
 *
 * A chip has room for a qualifier and no room for a reason. On a profile the reader is
 * looking at one person and the honest statement is longer than two words: this record has
 * no practice registration, so the location is their institution's, not theirs.
 */
export function practiceStateNote(basis: StateBasis, stateCode: string | null): string | null {
  if (basis !== "institution" || !stateCode) return null;
  return `No NPI is on record for this HCP, so where they practise is not established — ${stateCode} is where their institution is, not where they have been shown to practise.`;
}

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
