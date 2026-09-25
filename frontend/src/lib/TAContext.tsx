import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getIndicationTaId,
  indicationSlugToLabel,
  taLabelToApiSlug,
  taSlugToLabel,
} from "./routeSlugs";
import { apiSlugForTaId, taIdForApiSlug } from "./api";
import { getCurrentUser } from "./authHelpers";
import { supabase } from "./supabase";
import { loadTaManifest, type TaCapability } from "./taManifest";

/**
 * TAContext — global source of truth for the current therapeutic area + indication.
 * Peer to TrackContext. Phase 1a: the context is BUILT and POPULATED (writers wired)
 * but NO consumer reads it yet — every existing TA-derivation stays as-is, so this
 * changes zero behavior. Consumers migrate in Phase 1b.
 *
 * The value is normalized (the whole point): `indicationTaId` is the DATA UUID and is
 * DEFINED for both built TAs — NSCLC (c0065b03…) and AD (9e4139d2…) — resolved via
 * TA_ID_MAP[dataSlug] (taIdForApiSlug), NOT via getIndicationTaId (which is undefined
 * for NSCLC). This collapses the NSCLC-via-parent-slug / AD-via-indication asymmetry.
 */

export interface TAValue {
  parentTa: { label: string; slug: string; uuid: string | undefined };
  indication: { label: string; slug: string };
  indicationTaId: string | undefined;
  dataSlug: string;
}

/**
 * WHETHER THE SESSION HAS A TA AT ALL. Added 2026-09-24, ahead of the code that needs it.
 *
 * TAValue cannot express absence: every field is required and the constructor always
 * produces one (see DEFAULT_PARENT_SLUG below). So "no TA" has no representation, and the
 * blocking chooser stage 3 builds has no condition to fire on. This type is that condition,
 * introduced first so consumers can learn the vocabulary before the state becomes reachable.
 *
 * THREE STATES, NOT TWO, and the third is the one people forget. Establishment needs two
 * async reads -- the profile row and the capability manifest -- and collapsing "still
 * loading" into "no TA" would fire the chooser on every cold load and then retract it. Same
 * rule the manifest already follows: null means NOT YET KNOWN, never NOTHING AVAILABLE.
 *
 *   resolving     REACHABLE TODAY. The profile seed below is in flight.
 *   established   the normal state.
 *   unresolved    DECLARED BUT UNREACHABLE TODAY, and deliberately so. It becomes reachable
 *                 when the oncology/nsclc default is deleted and establishment can fail --
 *                 a separate change, because that is the one that can leave a real user
 *                 with no board. Until then this arm is vocabulary, not behaviour.
 */
export type TAStatus = "resolving" | "established" | "unresolved";

/** Why establishment produced no TA. Null unless status is "unresolved". */
export type TAUnresolvedReason = "no-default" | "no-entitlement" | "refused-link";

interface TAContextValue extends TAValue {
  /** Set the current TA from the two canonical slugs (parent + indication). */
  setTA: (parentSlug: string, indicationSlug: string) => void;
  /**
   * WHAT EACH TA HAS. One read at mount (see lib/taManifest.ts), null until it lands.
   * NULL MEANS "NOT YET KNOWN", NEVER "NOTHING IS AVAILABLE" -- a consumer that renders an
   * absence on null would be claiming a cohort does not exist because a fetch has not
   * returned yet.
   */
  manifest: TaCapability[] | null;
  /**
   * SHAPE IS ADDITIVE ON PURPOSE. TAValue's fields stay flat and always present rather than
   * moving behind a discriminated union, so no consumer has to change on the commit that
   * introduces the vocabulary. A union would force all nine call sites to handle a state
   * that cannot yet occur -- churn whose only effect would be to make the commit that
   * matters harder to read. The union is the right final shape and belongs with the change
   * that makes `unresolved` reachable.
   */
  status: TAStatus;
  unresolvedReason: TAUnresolvedReason | null;
}

const TAContext = createContext<TAContextValue | null>(null);

const STORAGE_KEY = "fieldmark.ta";
// Safe fallback = the app's home landing (Oncology / NSCLC), matching routeSlugs
// HOME_TA / HOME_INDICATION_SLUG. The per-user default in msl_profiles.default_ta_slug is no
// longer "deferred" (2026-09-06): TAProvider seeds from it below, so this pair is now the
// fallback for a user who has no profile default rather than for every user.
const DEFAULT_PARENT_SLUG = "oncology";
const DEFAULT_INDICATION_SLUG = "nsclc";

/**
 * Derive the full normalized TA value from the two canonical slugs.
 *
 * THE CRITICAL NORMALIZATION: dataSlug is the indication's own data slug when the
 * indication maps directly to a data UUID (nsclc, atopic-dermatitis); otherwise
 * ("All" / non-data indications) it falls back to the indication's mapped taId
 * (e.g. Immunology "All" → AD) and finally to the parent's active-data slug
 * (e.g. Oncology "All" → nsclc). `indicationTaId` is then TA_ID_MAP[dataSlug] — so it
 * is defined for NSCLC and AD alike.
 *
 * Exported as a PURE fn (Phase 1b.2) so callers can derive the TA SYNCHRONOUSLY from the
 * route on the same render. The provider's value is mirrored from the URL by an effect and
 * therefore lags it by one render; feed code that branches on the TA inside a render or an
 * effect must not read that lagging value. Same mapping, no lag — see useTA() vs this.
 */
export function deriveTAValue(parentSlug: string, indicationSlug: string): TAValue {
  const parentLabel = taSlugToLabel(parentSlug);
  // UNKNOWN PARENT TA -> NO DATA IDENTITY. taSlugToLabel returns null now instead of
  // substituting Oncology (see routeSlugs). That matters most HERE: parentSlug arrives from
  // sessionStorage via readStoredSelection, so a stale or hand-edited value is a real input,
  // not a hypothetical -- and every derivation below keys on the LABEL. Under the old default
  // a junk stored slug produced a complete, confident NSCLC TAValue.
  //
  // An unknown TA must not borrow a known one's maps, so it gets a value that carries no data
  // identity: the slug shown verbatim as its own label (the taLabels.ts convention -- an
  // unmapped thing should look unmapped), no indicationTaId, dataSlug left as the caller's
  // indication. Consumers already branch on indicationTaId being undefined.
  if (parentLabel === null) {
    return {
      parentTa: { label: parentSlug, slug: parentSlug, uuid: undefined },
      indication: { label: indicationSlug, slug: indicationSlug },
      indicationTaId: undefined,
      dataSlug: indicationSlug,
    };
  }

  const indicationLabel =
    indicationSlugToLabel(parentLabel, indicationSlug) ?? indicationSlug;

  let dataSlug = indicationSlug;
  let indicationTaId = taIdForApiSlug(dataSlug);
  if (!indicationTaId) {
    const byIndication = getIndicationTaId(parentLabel, indicationSlug);
    dataSlug = byIndication
      ? apiSlugForTaId(byIndication) ?? dataSlug
      // parentLabel came out of TA_SLUG_TO_LABEL above, so it is one of the four registered
      // labels and this cannot be null. Stated, not assumed.
      : taLabelToApiSlug(parentLabel) ?? dataSlug;
    indicationTaId = taIdForApiSlug(dataSlug);
  }

  return {
    parentTa: { label: parentLabel, slug: parentSlug, uuid: taIdForApiSlug(parentSlug) },
    indication: { label: indicationLabel, slug: indicationSlug },
    indicationTaId,
    dataSlug,
  };
}

/**
 * `stored` reports whether the session actually CARRIED a selection, as opposed to falling
 * back to the default pair. The profile hydration below needs that distinction: seeding over a
 * default is filling a blank, seeding over a real selection is overwriting a user's choice.
 */
function readStoredSelection(): { parentSlug: string; indicationSlug: string; stored: boolean } {
  if (typeof window === "undefined") {
    return { parentSlug: DEFAULT_PARENT_SLUG, indicationSlug: DEFAULT_INDICATION_SLUG, stored: false };
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { parentSlug?: unknown; indicationSlug?: unknown };
      if (
        typeof parsed?.parentSlug === "string" &&
        parsed.parentSlug.trim() !== "" &&
        typeof parsed?.indicationSlug === "string" &&
        parsed.indicationSlug.trim() !== ""
      ) {
        return { parentSlug: parsed.parentSlug, indicationSlug: parsed.indicationSlug, stored: true };
      }
    }
  } catch {
    // sessionStorage unavailable / malformed — fall through to default.
  }
  return { parentSlug: DEFAULT_PARENT_SLUG, indicationSlug: DEFAULT_INDICATION_SLUG, stored: false };
}

export function TAProvider({ children }: { children: ReactNode }) {
  const hadStoredSelection = useRef(false);
  const [value, setValue] = useState<TAValue>(() => {
    const { parentSlug, indicationSlug, stored } = readStoredSelection();
    hadStoredSelection.current = stored;
    return deriveTAValue(parentSlug, indicationSlug);
  });

  /**
   * RESOLVING UNTIL THE PROFILE SEED SETTLES. This is a real signal today, not a placeholder:
   * the seed below is an async read, and until it returns the session is carrying the
   * constructor's default rather than the user's stored preference. A consumer that renders
   * a TA name during that window is showing a guess.
   *
   * A session that already CARRIES a selection is established immediately -- there is nothing
   * to wait for, and hadStoredSelection is exactly that test.
   */
  const [status, setStatus] = useState<TAStatus>(() =>
    hadStoredSelection.current ? "established" : "resolving",
  );
  // Always null while `unresolved` is unreachable. Present so consumers can read it from the
  // start rather than acquiring it in the commit where the reason actually matters.
  const [unresolvedReason] = useState<TAUnresolvedReason | null>(null);

  // Any real write — a picker, a route mirror — closes the door on hydration below. Set
  // synchronously inside setTA rather than derived from `value`, because the profile fetch is
  // in flight while those writes land and a state compare would race it.
  const written = useRef(false);

  const applyTA = useCallback((parentSlug: string, indicationSlug: string) => {
    setValue(deriveTAValue(parentSlug, indicationSlug));
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ parentSlug, indicationSlug }),
        );
      } catch {
        // ignore storage failures; in-memory state still updates correctly.
      }
    }
  }, []);

  const setTA = useCallback(
    (parentSlug: string, indicationSlug: string) => {
      written.current = true;
      // A write settles the question, whatever the seed is doing.
      setStatus("established");
      applyTA(parentSlug, indicationSlug);
    },
    [applyTA],
  );

  /**
   * SEED FROM THE USER'S PROFILE DEFAULT — ONCE, AND ONLY INTO AN EMPTY SESSION.
   *
   * This work used to live in HomePage, where it ran on EVERY visit to /me and therefore
   * overwrote whatever the user had selected: pick Colorectal on the ledger, click Home, and
   * the session TA silently reverted to lung. Moving it here is what makes it a DEFAULT rather
   * than a correction — it fills a blank and then never speaks again.
   *
   * TWO GUARDS, both required. `hadStoredSelection` covers the session that already carries a
   * choice from a previous page. `written` covers the choice that lands WHILE this fetch is in
   * flight — a route mirror or a picker firing first — which the storage check cannot see.
   *
   * NO FALLBACK ON FAILURE. A logged-out user, a missing profile row, an unregistered stored
   * slug: all leave the constructor's default pair in place. Inventing a TA here would be the
   * same class of bug this commit exists to remove.
   */
  useEffect(() => {
    if (hadStoredSelection.current) return;
    let alive = true;
    (async () => {
      /**
       * SETTLE THE STATUS ON EVERY EXIT, including the early returns and the catch. The
       * session is "resolving" only while this is in flight; once it has run, the TA on
       * screen is the one the session is going to carry, whether that came from the profile
       * or from the constructor's default. Leaving status at "resolving" on the failure
       * paths would be the more dangerous mistake of the two: a surface that waits for
       * establishment would wait forever, and the state it is waiting for is exactly the one
       * the chooser will key on.
       */
      try {
        const user = await getCurrentUser();
        if (!user || !alive || written.current) return;
        const { data } = await supabase
          .from("msl_profiles")
          .select("default_ta_slug, default_indication_slug")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!alive || written.current) return;
        const parentSlug = data?.default_ta_slug ?? "";
        if (!parentSlug || taSlugToLabel(parentSlug) === null) return;
        const indicationSlug = data?.default_indication_slug ?? "";
        if (!indicationSlug) return;
        applyTA(parentSlug, indicationSlug);
      } catch {
        // Leave the default in place; see NO FALLBACK ON FAILURE above.
      } finally {
        // NOT `unresolved`: the default pair is still in place, so the session HAS a TA.
        // This is the line that changes when that default is deleted -- the failure paths
        // above become the unresolved cases, and each gets its reason.
        if (alive) setStatus("established");
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyTA]);

  /**
   * THE CAPABILITY MANIFEST, FETCHED ONCE. Not per surface: the answer is the same for the
   * life of the session and four separate literals used to hold copies of it.
   *
   * loadTaManifest memoises and also fills the module-level cache the pure helpers in
   * cohortLedger.ts read, so this one call serves both the React consumers below and
   * comTierFilters / cohortServesTa / cohortAvailable, which are not hooks.
   *
   * NO FALLBACK ON FAILURE. It stays null, and every consumer treats null as "not yet
   * known" rather than as an empty registry -- the same rule as the profile seed above.
   */
  const [manifest, setManifest] = useState<TaCapability[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadTaManifest()
      .then((m) => { if (alive) setManifest(m); })
      .catch(() => { /* leave null; consumers say nothing rather than guess */ });
    return () => { alive = false; };
  }, []);

  // TEMPORARY (Phase 1a, dev-only): surface the context so Garrett can confirm the
  // value per route in the browser while NO consumer reads it yet. Logs on change +
  // exposes window.__fieldmarkTA. REMOVE/GATE before Phase 1b.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    (window as unknown as { __fieldmarkTA?: TAValue }).__fieldmarkTA = value;
    // eslint-disable-next-line no-console
    console.log("[TAContext]", value);
  }, [value]);

  return (
    <TAContext.Provider value={{ ...value, setTA, manifest, status, unresolvedReason }}>
      {children}
    </TAContext.Provider>
  );
}

export function useTA(): TAContextValue {
  const ctx = useContext(TAContext);
  if (!ctx) {
    throw new Error("useTA must be used inside <TAProvider>");
  }
  return ctx;
}
