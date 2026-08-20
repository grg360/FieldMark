import { COUNTRY_LABELS } from "./cohortLedger";

/**
 * The gate for sections backed by a US-ONLY register — Medicare Part B, CMS Open
 * Payments, NIH RePORTER. All three describe US systems, and until 2026-08-19 the
 * profile rendered their absence states for everyone: a German oncologist's profile
 * carried a block explaining that Medicare Part B could not be read for his record.
 *
 * NULL COUNTRY IS NOT NON-US. An unknown country must never scope a US physician out
 * of their own Medicare section — the honest absence text ("no NPI is matched to this
 * record") is correct for them and stays. So the gate fires only on a KNOWN,
 * NON-US country, and everything else keeps today's behaviour.
 */
export function isNonUsRecord(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toUpperCase();
  return c.length > 0 && c !== "US";
}

/** The country's name where we have one, else the raw code — "Germany", not "DE".
 *  Same map the ledger's location chip reads, so the two surfaces agree. */
export function countryName(country: string | null | undefined): string {
  const c = (country ?? "").trim().toUpperCase();
  if (!c) return "this record's country";
  return COUNTRY_LABELS[c] ?? c;
}
