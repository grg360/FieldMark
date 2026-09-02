import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { taIdForApiSlug, apiSlugForTaId, loadHcpTaIds, themesTagForTaId } from "./api";
import { useTA } from "./TAContext";

/**
 * WHICH TA IS THIS PROFILE ABOUT? Resolved for /hcp/:id, which carries no TA of its own.
 *
 * ?ta= IS OPTIONAL HERE, unlike the ledger. Requiring it would break the four ledger
 * back-links, search results, tracked-HCP lists and every existing bookmark, and the
 * measurement says the cost of getting it wrong is bounded: of the 41,281 HCPs on a board,
 * 3,278 sit on boards in more than one TA -- but for every one of them both TAs yield the
 * SAME SHELL (measured 2026-08-31). A wrong guess can produce wrong ranks, narratives and
 * labels; it cannot produce the wrong profile type.
 *
 * THE CHAIN:
 *   1. ?ta=                the URL wins when it names a resolvable data slug.
 *   2. TAContext, VALIDATED  the session's TA -- but only if this HCP is actually in it.
 *   3. the HCP's primary   most publications in hcp_therapeutic_areas_v2.
 *   4. null                only when the HCP belongs to no TA at all.
 *
 * WHY LAYER 2 IS VALIDATED (2026-08-31). The session TA is a real signal: for someone on two
 * boards it says which one you were just looking at, which publication counts cannot know.
 * That is why it outranks layer 3 and why it stays there. But it is a statement about the
 * USER, not about this HCP -- and on a cross-TA surface (Home, Watchlists, Follow-ups, search)
 * the surface has no opinion about the person clicked. Browse the CRC ledger, go Home, click a
 * tracked NSCLC-only HCP, and an unvalidated layer 2 answers CRC: that HCP has no CRC board
 * row, so isOnRisingBoard is false and the spine says community, and a lung KOL renders the
 * community shell. Checking membership first keeps the dual-board benefit and removes that
 * path: the session TA wins when this person is in it, and falls through when they are not.
 *
 * ONE QUERY. loadHcpTaIds answers both "is the session TA one of theirs" and "what is their
 * primary", so validation is free -- layer 3 had to make this read anyway.
 *
 * NO STEP 5. There is deliberately no hardcoded final default: layer 3 answers for every HCP
 * with a publication, and inventing a TA for one with none would put a heading over an empty
 * page.
 *
 * ?ta= IS NOT VALIDATED against membership, on purpose. An explicit URL is an instruction, and
 * a profile for a TA the HCP is not in should render its own honest emptiness rather than
 * silently redirect to a TA the reader did not ask for.
 *
 * The URL is NOT rewritten. A profile is reached from many places and is often a leaf; adding
 * a param to every visit would churn history for no gain. The ledger rewrites because its TA
 * is a persistent view-state the user chose -- a profile's is derived.
 *
 * themesTag RIDES ALONG, it is not a second lookup.
 *
 * hcp_research_themes_v2 is keyed by therapeutic_areas.themes_tag -- a tag, not the slug and
 * not the id, and not derivable from either ('NSCLC' for slug nsclc, 'Atopic Dermatitis' for
 * atopic-dermatitis). Consumers used to derive it themselves, four different ways. It arrives
 * HERE instead, on the same record that already carries taId and slug, so a profile that
 * knows its TA also knows how to read that TA's themes and never has to ask again.
 *
 * NULL WHILE RESOLVING, and null must gate the read rather than widen it. The tag needs one
 * network round-trip (memoised app-wide in loadThemesTagRegistry), so it lands a beat after
 * taId. A consumer seeing null must not fall back to an unscoped query -- unscoped is exactly
 * the defect this closes.
 */
export type ProfileTaState =
  | { status: "resolving" }
  | { status: "resolved"; taId: string; slug: string; themesTag: string | null; source: "url" | "session" | "primary" }
  | { status: "none" };

export function useProfileTa(hcpId: string | undefined): ProfileTaState {
  const [searchParams] = useSearchParams();
  const urlTa = searchParams.get("ta")?.trim().toLowerCase() || null;
  const { dataSlug: sessionSlug } = useTA();

  // Layer 1 only. Layer 2 can no longer be answered synchronously -- it needs this HCP's
  // memberships -- so it is resolved in the effect alongside layer 3.
  const fromUrl = useMemo<ProfileTaState | null>(() => {
    const taId = urlTa ? taIdForApiSlug(urlTa) : undefined;
    return urlTa && taId ? { status: "resolved", taId, slug: urlTa, themesTag: null, source: "url" } : null;
  }, [urlTa]);

  const [resolved, setResolved] = useState<ProfileTaState>({ status: "resolving" });
  // Keyed on hcp + session TA: if the session TA changes under a mounted profile the
  // validation must run again, or a stale verdict outlives the thing it was about.
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (fromUrl || !hcpId) return;
    const key = `${hcpId}|${sessionSlug ?? ""}`;
    if (asked.current === key) return;
    asked.current = key;
    let alive = true;
    (async () => {
      const taIds = await loadHcpTaIds(hcpId);
      if (!alive) return;
      if (taIds.length === 0) {
        setResolved({ status: "none" });
        return;
      }
      // 2 — the session TA, but only if this HCP is in it.
      const sessionTaId = sessionSlug ? taIdForApiSlug(sessionSlug) : undefined;
      if (sessionTaId && taIds.includes(sessionTaId)) {
        setResolved({ status: "resolved", taId: sessionTaId, slug: sessionSlug as string, themesTag: null, source: "session" });
        return;
      }
      // 3 — their primary: loadHcpTaIds is already ordered by publication_count desc.
      const primaryId = taIds[0];
      const slug = apiSlugForTaId(primaryId);
      setResolved(slug
        ? { status: "resolved", taId: primaryId, slug, themesTag: null, source: "primary" }
        : { status: "none" });
    })().catch(() => { if (alive) setResolved({ status: "none" }); });
    return () => { alive = false; };
  }, [fromUrl, hcpId, sessionSlug]);

  const base = fromUrl ?? resolved;
  const baseTaId = base.status === "resolved" ? base.taId : null;

  // The tag for whichever layer won. Stored WITH the taId it was resolved for, and read back
  // only on a match, so the window between "the TA changed" and "its tag arrived" yields null
  // rather than the previous TA's tag -- which would be the same cross-TA leak in a new place.
  const [tagFor, setTagFor] = useState<{ taId: string; tag: string | null } | null>(null);
  useEffect(() => {
    if (!baseTaId) return;
    let alive = true;
    themesTagForTaId(baseTaId)
      .then((tag) => { if (alive) setTagFor({ taId: baseTaId, tag }); })
      .catch(() => { if (alive) setTagFor({ taId: baseTaId, tag: null }); });
    return () => { alive = false; };
  }, [baseTaId]);

  const themesTag = tagFor && tagFor.taId === baseTaId ? tagFor.tag : null;

  // Memoised so consumers can keep the whole state object in an effect dependency list
  // without re-running on every render.
  return useMemo<ProfileTaState>(
    () => (base.status === "resolved" ? { ...base, themesTag } : base),
    [base, themesTag],
  );
}
