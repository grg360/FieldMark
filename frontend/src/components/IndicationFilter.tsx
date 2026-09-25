// NO IMPORTS. This file is now pure data, and that is load-bearing: it used to import
// routeSlugs while routeSlugs imports INDICATIONS_BY_TA from here, a cycle that only held
// together because both sides were module-level constants. Removing the component removes
// the cycle.

// DECOUPLED 2026-08-15. `label` used to be the identity AND the display string,
// so renaming NSCLC -> Lung Cancer silently broke every label-keyed lookup: the
// reverse map's key moved, callers kept passing the old string, and the misses
// fell through to "all". `slug` is the identity now - stable, matches the URL
// segment and routeSlugs' slug->label maps. Same shape as AdministeredVolumeBlock's
// AgentBadge + BADGE_LABEL: the value never moves, the label is free to.
export interface IndicationOption {
  /** Stable identity. Every lookup, comparison and route build keys on THIS. */
  slug: string;
  /** Display only. Nothing dispatches on it - rename freely. */
  label: string;
  active: boolean;
  count?: number;
  taId?: string;
}

export const INDICATIONS_BY_TA: Record<string, IndicationOption[]> = {
  Oncology: [
    { slug: "all", label: "All", active: true, count: 6549 },
    { slug: "nsclc", label: "Lung Cancer", active: true, count: 287 },
    { slug: "car-t", label: "CAR-T", active: false },
    { slug: "dlbcl", label: "DLBCL", active: false },
    { slug: "melanoma", label: "Melanoma", active: false },
    { slug: "cll", label: "CLL", active: false },
    { slug: "aml", label: "AML", active: false },
    { slug: "breast", label: "Breast", active: false },
    { slug: "prostate", label: "Prostate", active: false },
    // taId REMOVED 2026-09-21, and the hazard it guarded is gone with it. The note here
    // used to say taId was REQUIRED, not decoration: getEstablished/getCommunity/
    // getRisingStars do `filters.taId ?? TA_ID_MAP[taSlug]` and taSlug for Oncology is
    // hardcoded "nsclc", so an active option with no taId served LUNG rows under a
    // colorectal chip. getIndicationTaId now resolves a real TA's uuid from
    // ta_capability_manifest() by slug, so there is no per-indication field left to forget
    // and no way for a new indication to be added without one. See routeSlugs.
    { slug: "colorectal-cancer", label: "Colorectal Cancer", active: true },
    { slug: "bladder", label: "Bladder", active: false },
    { slug: "ovarian", label: "Ovarian", active: false },
    { slug: "kidney", label: "Kidney", active: false },
    { slug: "pancreatic", label: "Pancreatic", active: false },
    { slug: "liver-hcc", label: "Liver/HCC", active: false },
  ],
  Hepatology: [
    { slug: "all", label: "All", active: true, count: 2753 },
    { slug: "mash", label: "MASH", active: true, count: 247 },
    { slug: "pbc", label: "PBC", active: true, count: 134 },
    { slug: "hcc", label: "HCC", active: false },
    { slug: "autoimmune-hepatitis", label: "Autoimmune Hepatitis", active: false },
    { slug: "nafld", label: "NAFLD", active: false },
  ],
  "Rare Disease": [
    { slug: "all", label: "All", active: true, count: 2034 },
    { slug: "fabry-disease", label: "Fabry Disease", active: false },
    { slug: "pompe-disease", label: "Pompe Disease", active: false },
    { slug: "gaucher-disease", label: "Gaucher Disease", active: false },
    { slug: "als", label: "ALS", active: false },
    { slug: "sma", label: "Spinal Muscular Atrophy", active: false },
    { slug: "cystic-fibrosis", label: "Cystic Fibrosis", active: false },
  ],
  Immunology: [
    // THE ONE taId THAT STAYS, and it is not a per-TA uuid: "all" is an AGGREGATE with no
    // therapeutic_areas row, so the manifest has nothing to match it against. It encodes
    // "Immunology All resolves to AD", which deriveTAValue needs and which is stage 2's to
    // move. Every INDICATION uuid now comes from the manifest.
    { slug: "all", label: "All", active: true, count: 7462, taId: "9e4139d2-e062-4a58-8728-cdabb2d7dca1" },
    { slug: "atopic-dermatitis", label: "Atopic Dermatitis", active: true, count: 7462 },
    { slug: "psoriasis", label: "Psoriasis", active: false },
    { slug: "rheumatoid-arthritis", label: "Rheumatoid Arthritis", active: false },
    { slug: "crohns", label: "Crohn's Disease", active: false },
    { slug: "ulcerative-colitis", label: "Ulcerative Colitis", active: false },
    { slug: "lupus", label: "Lupus", active: false },
    { slug: "multiple-sclerosis", label: "Multiple Sclerosis", active: false },
  ],
};

// Slugs, never labels. This is a SECOND gate on top of each option's `active`
// flag: a slug missing here renders as an inert, unexplained grey chip on
// /field-intelligence even when the option is active everywhere else. Keep it in
// step with the active entries above.

// THE COMPONENT IS GONE (2026-09-24), THE DATA STAYS.
//
// <IndicationFilter> was already dead-in-tree before the card feed was retired -- nothing
// had mounted it since PeopleNavStrip absorbed the TAFilterChips + IndicationFilter +
// DashboardTabs trio. It is removed here with the rest of the feed, and with it the last
// setTA caller outside the ledger and the route mirror.
//
// INDICATIONS_BY_TA ABOVE IS STILL LIVE and is why this file still exists. routeSlugs.ts
// reads it for route resolution -- resolveIndicationForTa, indicationSlugToLabel,
// getFirstActiveIndicationSlug, isIndicationDataActive, getIndicationTaId -- which the
// ledger and the redirect both depend on. Moving it somewhere better named belongs with
// stage 2's route work, not with a deletion pass: the constant has one remaining job
// (route vocabulary) and moving it while its consumers are mid-change would be two
// changes wearing one commit.
//
// ONCOLOGY_FI_ACTIVE and indicationsForContext went with the component: both existed only
// to narrow the option list for the retired field-intelligence feed track.
