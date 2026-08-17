import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
// HOME_TA / HOME_INDICATION_SLUG. (A per-user default lives in msl_profiles.default_ta_slug;
// seeding from it is deferred — it needs an async fetch and no consumer reads this yet.)
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
  const indicationLabel =
    indicationSlugToLabel(parentLabel, indicationSlug) ?? indicationSlug;

  let dataSlug = indicationSlug;
  let indicationTaId = taIdForApiSlug(dataSlug);
  if (!indicationTaId) {
    const byIndication = getIndicationTaId(parentLabel, indicationSlug);
    dataSlug = byIndication
      ? apiSlugForTaId(byIndication) ?? dataSlug
      : taLabelToApiSlug(parentLabel);
    indicationTaId = taIdForApiSlug(dataSlug);
  }

  return {
    parentTa: { label: parentLabel, slug: parentSlug, uuid: taIdForApiSlug(parentSlug) },
    indication: { label: indicationLabel, slug: indicationSlug },
    indicationTaId,
    dataSlug,
  };
}

function readStoredSelection(): { parentSlug: string; indicationSlug: string } {
  if (typeof window === "undefined") {
    return { parentSlug: DEFAULT_PARENT_SLUG, indicationSlug: DEFAULT_INDICATION_SLUG };
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
        return { parentSlug: parsed.parentSlug, indicationSlug: parsed.indicationSlug };
      }
    }
  } catch {
    // sessionStorage unavailable / malformed — fall through to default.
  }
  return { parentSlug: DEFAULT_PARENT_SLUG, indicationSlug: DEFAULT_INDICATION_SLUG };
}

export function TAProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<TAValue>(() => {
    const { parentSlug, indicationSlug } = readStoredSelection();
    return deriveTAValue(parentSlug, indicationSlug);
  });

  const setTA = useCallback((parentSlug: string, indicationSlug: string) => {
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
