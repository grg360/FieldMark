import { entitledTASlugs } from "./api";
import { loadTaManifest, offerableTas, type TaCapability } from "./taManifest";

/**
 * WHICH TAs A USER IS ENTITLED TO, AS LEAF TAs.
 *
 * ############################################################################
 * # THIS ENFORCES NOTHING. Nothing gates on it, nothing hides because of it,  #
 * # and no surface is narrowed by it today. It is a COMPUTATION, wired up so  #
 * # the chooser has something to ask when it is built.                        #
 * ############################################################################
 *
 * Stated that loudly because the shape invites the opposite assumption: a function called
 * "entitled…" that returns a filtered list looks like an access check, and a reader who
 * assumes it is one will conclude the app restricts TAs. It does not. Every TA the manifest
 * offers is reachable by every signed-in user right now, by URL and by the domain chip.
 *
 * TWO GRAINS, WHICH IS THE WHOLE REASON THIS FUNCTION EXISTS.
 * msl_profiles.allowed_ta_slugs stores PARENT slugs -- ['oncology', 'immunology'] -- while
 * every surface, link and session names a LEAF ('nsclc', 'colorectal-cancer',
 * 'atopic-dermatitis'). Comparing them directly is the bug this prevents: 'nsclc' is not in
 * allowed_ta_slugs and never will be, so a naive `allowed.includes(taSlug)` refuses
 * everything. entitledTASlugs answers in parents; the manifest knows each leaf's parent;
 * this joins them.
 *
 * IT ALSO FAILS OPEN, INHERITED FROM entitledTASlugs. An empty or missing allowed_ta_slugs
 * yields every live TA (ENTITLEMENT_UNSET_MEANS_ALL_LIVE in api.ts). So an unentitled user
 * currently gets MORE than a fully entitled one would, not less. That is deliberate
 * grandfathering and it must be reversed before the first single-TA customer -- see the note
 * on that constant, which also records why the reversal belongs with the chooser rather than
 * before it.
 *
 * MEASURED 2026-09-24: all 8 msl_profiles rows carry both a default TA and a non-empty
 * allowed_ta_slugs ({oncology, immunology}), so the fail-open branch is unreachable for
 * every current user and this function returns all three offerable leaves for all of them.
 * It has no visible effect on anyone today, by construction.
 */
export async function entitledLeafTas(
  profile: { allowed_ta_slugs?: string[] | null },
): Promise<TaCapability[]> {
  const [parents, manifest] = await Promise.all([
    entitledTASlugs(profile),
    loadTaManifest(),
  ]);
  const allowed = new Set(parents);
  // A leaf with no parent is its own domain (hepatology's shape), so it is matched on its
  // own slug -- the same rule offerableByDomain uses.
  return offerableTas(manifest).filter((c) => allowed.has(c.parentSlug ?? c.slug));
}

/**
 * Is this leaf TA one the user may be in? Answers the question a foreign-TA deep link asks:
 * refuse outright, or refuse and offer an explicit switch.
 *
 * AGAIN: NOTHING CALLS THIS YET, and nothing refuses anything. The refusal lives with the
 * URL inversion, which is a later change -- while the URL can still SET the session TA,
 * refusing a link here would only fight the mirror that is about to overwrite it.
 */
export async function isEntitledToLeafTa(
  profile: { allowed_ta_slugs?: string[] | null },
  leafSlug: string | null | undefined,
): Promise<boolean> {
  if (!leafSlug) return false;
  const leaves = await entitledLeafTas(profile);
  return leaves.some((c) => c.slug === leafSlug);
}
