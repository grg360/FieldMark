import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";
import { getCurrentUser } from "./authHelpers";
import { taIdForApiSlug, apiSlugForTaId } from "./api";
import { deriveTAValue } from "./TAContext";

/**
 * WHICH TA IS THE LEDGER SHOWING? Resolved for /cohorts/ledger/:cohort, which carries no TA
 * of its own.
 *
 * THE SHAPE IS InstitutionRoute'S (?ta= on the query string) BUT NOT ITS BEHAVIOUR.
 * InstitutionRoute.tsx:96 reads `searchParams.get("ta") ?? "nsclc"` -- a silent default to a
 * real TA, which is the exact failure this surface must not inherit: a colorectal MSL opening
 * a bookmarked ledger would get a lung board with nothing on screen saying so.
 *
 * FOUR LAYERS, NO LITERAL IN ANY OF THEM:
 *   1. ?ta=          the URL is authoritative when it carries a resolvable data slug.
 *   2. TAContext     the session's current TA (sessionStorage "fieldmark.ta"), already
 *                    normalised to a data slug by deriveTAValue -- the same value the feed
 *                    uses, so arriving from the feed keeps the TA you were looking at.
 *   3. profile       msl_profiles.default_ta_slug + default_indication_slug, the user's own
 *                    stated default. Not a guess by us: a preference by them.
 *   4. picker        nothing resolved -> ask. This is the honest terminal case, and the
 *                    reason no layer needs a hardcoded fallback.
 *
 * THE URL IS ALWAYS REWRITTEN to carry whatever resolved (replace, not push, so Back still
 * leaves the ledger). After the first render the address bar and the board cannot disagree,
 * which is what makes a ledger link shareable and a screenshot self-describing.
 *
 * VALIDITY IS `taIdForApiSlug`, NOT A LIST. A slug only resolves if it maps to a real TA
 * uuid, so an unknown, parked or hand-typed ?ta= falls through to the next layer instead of
 * producing a board-shaped 400.
 */
export type LedgerTaState =
  | { status: "resolving" }
  | { status: "resolved"; slug: string; taId: string; source: "url" | "session" | "profile" }
  | { status: "unresolved" };

export interface LedgerTa {
  state: LedgerTaState;
  /** Commit a TA from the picker. Writes the URL; the URL then drives everything. */
  choose: (slug: string) => void;
}

export interface AddressableTa {
  slug: string;
  taId: string;
  name: string;
}

/**
 * The TAs the picker can offer, read from therapeutic_areas -- NOT a list in this file.
 *
 * Two filters, both derived:
 *   * the frontend must hold an id for it (apiSlugForTaId round-trips), so choosing one
 *     produces a slug the resolver can turn back into a uuid;
 *   * it must be a LEAF among the addressable rows -- a TA that is the parent of another
 *     addressable TA is a grouping, not a board. That drops "oncology" while nsclc and
 *     colorectal-cancer are present, and keeps hepatology and rare-disease, which parent
 *     nothing. No slug is named here, so TA #4 appears the moment it is in TA_ID_MAP.
 */
let addressableCache: Promise<AddressableTa[]> | null = null;

/** Cleared on error only; the TA registry does not change within a session. */
export function clearAddressableTaCache(): void {
  addressableCache = null;
}

export async function loadAddressableTas(): Promise<AddressableTa[]> {
  // Memoised: the ledger's picker and the nav strip's live-tab set both read this, and it is
  // the same answer for the life of the session. Same shape as getLiveTASlugs in api.ts.
  if (!addressableCache) {
    addressableCache = fetchAddressableTas();
    addressableCache.catch(() => { addressableCache = null; });
  }
  return addressableCache;
}

async function fetchAddressableTas(): Promise<AddressableTa[]> {
  const { data, error } = await supabase
    .from("therapeutic_areas")
    .select("id, name, slug, parent_ta_id")
    .order("name");
  if (error || !data) return [];
  const rows = data
    .map((r) => ({
      id: String(r.id),
      name: (r.name as string) ?? "",
      slug: (r.slug as string) ?? "",
      parentId: r.parent_ta_id ? String(r.parent_ta_id) : null,
    }))
    .filter((r) => apiSlugForTaId(r.id) === r.slug);
  const parentIds = new Set(rows.map((r) => r.parentId).filter(Boolean) as string[]);
  return rows
    .filter((r) => !parentIds.has(r.id))
    .map((r) => ({ slug: r.slug, taId: r.id, name: r.name }));
}

export function useLedgerTa(sessionDataSlug: string | undefined): LedgerTa {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTa = searchParams.get("ta")?.trim().toLowerCase() || null;

  // Layer 1 + 2 resolve synchronously; only the profile needs a fetch.
  const immediate = useMemo<LedgerTaState | null>(() => {
    const fromUrl = urlTa ? taIdForApiSlug(urlTa) : undefined;
    if (urlTa && fromUrl) return { status: "resolved", slug: urlTa, taId: fromUrl, source: "url" };
    const fromSession = sessionDataSlug ? taIdForApiSlug(sessionDataSlug) : undefined;
    if (sessionDataSlug && fromSession) {
      return { status: "resolved", slug: sessionDataSlug, taId: fromSession, source: "session" };
    }
    return null;
  }, [urlTa, sessionDataSlug]);

  const [profileState, setProfileState] = useState<LedgerTaState>({ status: "resolving" });
  const fetched = useRef(false);

  useEffect(() => {
    if (immediate || fetched.current) return;
    fetched.current = true;
    let alive = true;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          if (alive) setProfileState({ status: "unresolved" });
          return;
        }
        const { data } = await supabase
          .from("msl_profiles")
          .select("default_ta_slug, default_indication_slug")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!alive) return;
        const parent = data?.default_ta_slug ?? "";
        const indication = data?.default_indication_slug ?? "";
        // deriveTAValue is the one normaliser for the parent/indication pair -- the same
        // function the feed uses. It returns a dataSlug with no data identity when the
        // stored parent is not a registered TA, so a stale profile falls through to the
        // picker rather than borrowing another TA's board.
        const derived = parent || indication ? deriveTAValue(parent, indication) : null;
        const slug = derived?.dataSlug ?? "";
        const taId = derived?.indicationTaId ?? (slug ? taIdForApiSlug(slug) : undefined);
        setProfileState(
          slug && taId
            ? { status: "resolved", slug, taId, source: "profile" }
            : { status: "unresolved" },
        );
      } catch {
        if (alive) setProfileState({ status: "unresolved" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [immediate]);

  const state: LedgerTaState = immediate ?? profileState;

  // THE URL CARRIES WHAT RESOLVED. Only when it does not already say so, and always
  // `replace` -- a rewrite is not a navigation, and pushing would trap Back on the ledger.
  useEffect(() => {
    if (state.status !== "resolved") return;
    if (urlTa === state.slug) return;
    const next = new URLSearchParams(searchParams);
    next.set("ta", state.slug);
    setSearchParams(next, { replace: true });
  }, [state, urlTa, searchParams, setSearchParams]);

  const choose = useCallback(
    (slug: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("ta", slug);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return { state, choose };
}
