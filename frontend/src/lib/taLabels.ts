// The ONE therapeutic-area slug → display-label map, 2026-08-15.
//
// MOVED here from lib/api.ts (TA_DISPLAY_NAME_BY_SLUG) rather than copied —
// api.ts now imports it back, so there is exactly one copy of these strings.
// It lives in a leaf module with no Supabase import so presentational surfaces
// (cards, chips, the marketing page, the SkyView canvas) can read a label
// without pulling the data layer into their bundle.
//
// WHY THIS EXISTS. The 2026-08-15 NSCLC → Lung Cancer rename surfaced two
// separate failures, both from a label being derived somewhere other than a map:
//   1. InstitutionsIndexRoute did `taSlug.toUpperCase()`, which rendered
//      "Institutions / NSCLC" no matter what the map said. A slug is an
//      identifier, not an abbreviation of the name — uppercasing one is a
//      coincidence that held for exactly one TA.
//   2. Four more near-duplicate maps drifted apart (see below).
// So: labels come from here, never from string manipulation on a slug.
//
// STILL DUPLICATED elsewhere, flagged not folded (each needs its own review):
//   · lib/api.ts landscapeTaSlugToName        — has the `?? slug.toUpperCase()`
//                                                fallback, i.e. bug #1 again
//   · App.tsx formatTherapeuticAreaLabel
//   · components/DOLListingModal.tsx formatTALabel
//   · lib/routeSlugs.ts ONCOLOGY_SLUG_TO_LABEL (indication-scoped, per-TA)
export const TA_DISPLAY_NAME_BY_SLUG: Record<string, string> = {
  nsclc: "Lung Cancer",
  "colorectal-cancer": "Colorectal Cancer",
  "atopic-dermatitis": "Atopic Dermatitis",
  hepatology: "Hepatology",
  "rare-disease": "Rare Disease",
  immunology: "Immunology",
  oncology: "Oncology",
};

/**
 * Display label for a TA slug. Falls back to the slug VERBATIM — never
 * uppercased, never de-hyphenated. An unmapped slug should look unmapped, so a
 * missing entry is visible as a bug rather than passing as a plausible label.
 *
 * Surfaces that render tracked caps call `.toUpperCase()` at the call site: the
 * casing belongs to the surface, the words belong here.
 */
export function taLabelForSlug(slug: string | null | undefined): string {
  const key = String(slug ?? "").trim().toLowerCase();
  return TA_DISPLAY_NAME_BY_SLUG[key] ?? key;
}
