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

interface TAContextValue extends TAValue {
  /** Set the current TA from the two canonical slugs (parent + indication). */
  setTA: (parentSlug: string, indicationSlug: string) => void;
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
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyTA]);

  // TEMPORARY (Phase 1a, dev-only): surface the context so Garrett can confirm the
  // value per route in the browser while NO consumer reads it yet. Logs on change +
  // exposes window.__fieldmarkTA. REMOVE/GATE before Phase 1b.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    (window as unknown as { __fieldmarkTA?: TAValue }).__fieldmarkTA = value;
    // eslint-disable-next-line no-console
    console.log("[TAContext]", value);
  }, [value]);

  return <TAContext.Provider value={{ ...value, setTA }}>{children}</TAContext.Provider>;
}

export function useTA(): TAContextValue {
  const ctx = useContext(TAContext);
  if (!ctx) {
    throw new Error("useTA must be used inside <TAProvider>");
  }
  return ctx;
}
