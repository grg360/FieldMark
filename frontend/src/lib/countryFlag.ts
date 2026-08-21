// Country flag assets — vendored, no runtime dependency.
//
// SOURCE: flag-icons@7.5.0, the 4x3 set, copied into public/flags/{iso}.svg on
// 2026-08-21. Vendored rather than referenced from unpkg (which index.html
// already uses for Leaflet) so the flags are same-origin, versioned in git, and
// cannot change under us when a border does. Refresh by re-running npm pack and
// re-copying; update FLAG_ASSETS in the same commit.
//
// COVERAGE IS THE BOARD, NOT THE LABEL MAP. The set below is the union of every
// country on the Established and Rising NSCLC boards (86 as of 2026-08-21), NOT
// the 48 entries in COUNTRY_LABELS. 40 board countries -- Canada, Brazil,
// Israel, Mexico, Turkey, Russia, South Africa among them -- have no label entry
// and would have been silently missed by keying off that map.
//
// TAIWAN takes the flag flag-icons ships for `tw` (the ROC flag). HK and MO take
// their SAR flags. That is a choice this file makes explicitly rather than
// inherits: 4,119 TW, 1,576 HK and 155 MO records carry these codes.
//
// THE MANIFEST IS THE POINT. flagSrc() checks membership before returning a
// path, so a code with no asset returns null and the caller renders the code as
// text. Without it every unknown code would emit an <img> that 404s -- a broken
// image is worse than the two letters it replaced.

const FLAG_ASSETS: ReadonlySet<string> = new Set([
  "ae", "ar", "at", "au", "bd", "be", "bg", "bh", "br", "ca", "ch", "cl", 
  "cn", "co", "cr", "cu", "cy", "cz", "de", "dk", "ee", "eg", "es", "et", 
  "fi", "fr", "gb", "ge", "gr", "hk", "hr", "hu", "id", "ie", "il", "in", 
  "ir", "is", "it", "jo", "jp", "ke", "kh", "kr", "kw", "kz", "la", "lb", 
  "lt", "lu", "lv", "ma", "mg", "mn", "mo", "mx", "my", "nl", "no", "nz", 
  "pa", "pe", "pk", "pl", "pr", "ps", "pt", "qa", "ro", "rs", "ru", "rw", 
  "sa", "se", "sg", "si", "sk", "th", "tn", "tr", "tw", "ua", "us", "uy", 
  "vn", "za"
]);

/** Public path to a country's flag, or null when no asset is vendored.
 *  Callers MUST handle null by rendering the code as text -- never a
 *  placeholder image, never a broken <img>.
 *
 *  Returns null for pool names too (GLOBAL, EUROPE, APAC): they are not
 *  countries, they have no asset, and the membership check is what keeps them
 *  flagless without a special case at the call site. */
export function flagSrc(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toLowerCase();
  if (c.length !== 2 || !FLAG_ASSETS.has(c)) return null;
  return `/flags/${c}.svg`;
}
