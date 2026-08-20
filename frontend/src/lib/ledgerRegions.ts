import { supabase } from "./supabase";

/**
 * The territory menu's regions, read from the database rather than hardcoded.
 *
 * WHY AN RPC AND NOT A TABLE READ. `regions` and `region_countries` both have RLS
 * ENABLED WITH ZERO POLICIES, while SELECT is granted to anon and authenticated —
 * under Postgres that grant is inert and the client gets zero rows. Nothing has failed
 * because every existing reader is a SECURITY DEFINER function or a server-side script.
 * A direct `.from("regions")` here would render an EMPTY territory menu, silently.
 * `ledger_regions()` is SECURITY DEFINER, which is how every other client read on this
 * surface already works. Adding a policy instead would change an RLS posture someone
 * chose, as a side effect of a menu — see docs/REGIONS_FRONTEND_DUPLICATE_LIST.md.
 */
export interface LedgerRegion {
  region_key: string;
  display_name: string;
  sort_order: number;
  is_global: boolean;
  is_catchall: boolean;
  /** True when this region has a scored aggregate board (Established) — see
   *  migrations/2026_08_18_regions_aggregate_scope.sql. */
  aggregate_scope: boolean;
  countries: string[];
}

/**
 * Memoised for the page's lifetime. This is reference data that changes when someone
 * runs a migration, not per-session state, and the territory menu re-renders on every
 * scope change — refetching there would be one round trip per click.
 */
let cached: Promise<LedgerRegion[]> | null = null;

export function loadLedgerRegions(): Promise<LedgerRegion[]> {
  if (cached) return cached;
  // Assign the local, not the field, so a failure path can null the cache without the
  // return type becoming nullable. supabase.rpc() is a PromiseLike, not a Promise —
  // it has no .catch — so the try/catch lives inside an async wrapper.
  const p = (async (): Promise<LedgerRegion[]> => {
    try {
      const { data, error } = await supabase.rpc("ledger_regions");
      if (error) {
        // Do NOT keep a failed result: a transient error would otherwise pin an empty
        // territory menu for the rest of the session.
        cached = null;
        console.warn("ledger_regions:", error.message);
        return [];
      }
      return (data ?? []) as LedgerRegion[];
    } catch (e) {
      cached = null;
      console.warn("ledger_regions:", e);
      return [];
    }
  })();
  cached = p;
  return p;
}

/** The region keys that carry a scored aggregate board. Their scope_value is a region
 *  key rather than an ISO country code, which is what makes them recognisable — and
 *  what makes them leak into any query that selects scope rows by NEGATION. */
export async function aggregateScopeValues(): Promise<string[]> {
  const regions = await loadLedgerRegions();
  return regions.filter((r) => r.aggregate_scope).map((r) => r.region_key);
}
