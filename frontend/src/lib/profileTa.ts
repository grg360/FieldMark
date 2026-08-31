import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { taIdForApiSlug, apiSlugForTaId, resolvePrimaryTaId } from "./api";
import { useTA } from "./TAContext";

/**
 * WHICH TA IS THIS PROFILE ABOUT? Resolved for /hcp/:id, which carries no TA of its own.
 *
 * ?ta= IS OPTIONAL HERE, unlike the ledger. Requiring it would break the four ledger
 * back-links, search results, tracked-HCP lists and every existing bookmark, and the
 * measurement says the cost of getting it wrong is bounded: of the 41,281 HCPs on a board,
 * 3,278 sit on boards in more than one TA -- but for every one of them both TAs yield the
 * SAME SHELL (measured 2026-08-31: `distinct_kinds = 1` across all of them). A wrong guess
 * can therefore produce wrong ranks, narratives and labels; it cannot produce the wrong
 * profile type. That is what makes a fallback chain acceptable where the ledger needed a
 * picker.
 *
 * THE CHAIN:
 *   1. ?ta=              the URL wins when it names a resolvable data slug.
 *   2. TAContext         the session's TA, so clicking a row on the CRC ledger opens a CRC
 *                        profile rather than re-deriving one from publication counts.
 *   3. resolvePrimaryTaId  the HCP's own primary TA -- most publications in
 *                        hcp_therapeutic_areas_v2. A fact about this person, not a default.
 *   4. null              only when the HCP belongs to no TA at all. Callers render an
 *                        absence; nothing downstream substitutes a TA.
 *
 * NO STEP 5. There is deliberately no hardcoded final default: step 3 already answers for
 * every HCP with a single publication, and inventing a TA for one with none would put a lung
 * heading over an empty page.
 *
 * The URL is NOT rewritten. A profile is reached from many places and is often a leaf; adding
 * a param to every visit would churn history for no gain. The ledger rewrites because its TA
 * is a persistent view-state the user chose -- a profile's is derived.
 */
export type ProfileTaState =
  | { status: "resolving" }
  | { status: "resolved"; taId: string; slug: string; source: "url" | "session" | "primary" }
  | { status: "none" };

export function useProfileTa(hcpId: string | undefined): ProfileTaState {
  const [searchParams] = useSearchParams();
  const urlTa = searchParams.get("ta")?.trim().toLowerCase() || null;
  const { dataSlug: sessionSlug } = useTA();

  const immediate = useMemo<ProfileTaState | null>(() => {
    const fromUrl = urlTa ? taIdForApiSlug(urlTa) : undefined;
    if (urlTa && fromUrl) return { status: "resolved", taId: fromUrl, slug: urlTa, source: "url" };
    const fromSession = sessionSlug ? taIdForApiSlug(sessionSlug) : undefined;
    if (sessionSlug && fromSession) {
      return { status: "resolved", taId: fromSession, slug: sessionSlug, source: "session" };
    }
    return null;
  }, [urlTa, sessionSlug]);

  const [primary, setPrimary] = useState<ProfileTaState>({ status: "resolving" });
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (immediate || !hcpId || asked.current === hcpId) return;
    asked.current = hcpId;
    let alive = true;
    resolvePrimaryTaId(hcpId)
      .then((taId) => {
        if (!alive) return;
        const slug = taId ? apiSlugForTaId(taId) : undefined;
        setPrimary(taId && slug
          ? { status: "resolved", taId, slug, source: "primary" }
          : { status: "none" });
      })
      .catch(() => { if (alive) setPrimary({ status: "none" }); });
    return () => { alive = false; };
  }, [immediate, hcpId]);

  return immediate ?? primary;
}
