import type { Track } from "./TrackContext";
import { INDICATIONS_BY_TA } from "../components/IndicationFilter";

export const HOME_TA = "Oncology";
// The home indication as a SLUG, not a label. It was "NSCLC" - a display string
// used as an identity - which is exactly what broke on the 2026-08-15 rename:
// the slug->label map moved to "Lung Cancer" while this constant kept feeding
// the old label into label-keyed lookups, and every miss fell through to "all".
// Labels are derived from this, never the reverse.
export const HOME_INDICATION_SLUG = "nsclc";
export const HOME_DASHBOARD: Track = "established";

export const TA_SLUG_TO_LABEL: Record<string, string> = {
  oncology: "Oncology",
  hepatology: "Hepatology",
  immunology: "Immunology",
  "rare-disease": "Rare Disease",
};

export const TA_LABEL_TO_SLUG: Record<string, string> = {
  Oncology: "oncology",
  Hepatology: "hepatology",
  Immunology: "immunology",
  "Rare Disease": "rare-disease",
};

export const TRACK_TO_DASHBOARD_SLUG: Record<Track, string> = {
  established: "established",
  community: "community",
  "rising-stars": "rising-stars",
  social: "social",
  // Track value is "skyview"; the URL slug stays "telescope" (route-segment
  // rename is a later stage). So skyview → /…/telescope/… .
  skyview: "telescope",
  "field-intelligence": "field-intelligence",
};

// "social" and "field-intelligence" removed 2026-07-31: Social is a top-level
// destination (/social/:ta) and the FI feed track is deleted (the forum at
// /field-intelligence is the one FI system). Old /:ta/social and
// /:ta/field-intelligence URLs fall back to the default cohort feed like any
// unknown dashboard slug. (The Track union keeps both values for
// retained-unrouted components; TRACK_TO_DASHBOARD_SLUG is Record<Track,_> so
// its entries stay, but nothing builds those feed paths anymore.)
export const DASHBOARD_SLUG_TO_TRACK: Record<string, Track> = {
  established: "established",
  community: "community",
  "rising-stars": "rising-stars",
  // URL slug "telescope" resolves to the "skyview" track (segment rename pending).
  telescope: "skyview",
};

const ONCOLOGY_SLUG_TO_LABEL: Record<string, string> = {
  all: "All",
  nsclc: "Lung Cancer",
  // The BUILT colorectal TA (ta_uuid a2b28e54…). The inactive "colorectal"
  // placeholder was retired 2026-08-24 in favour of this slug, so there is now
  // exactly ONE colorectal identifier in the frontend. Do not reintroduce a
  // bare "colorectal" — it would resolve to a label here while missing
  // TA_ID_MAP, i.e. look valid and carry no TA id.
  "colorectal-cancer": "Colorectal Cancer",
  "car-t": "CAR-T",
  dlbcl: "DLBCL",
  melanoma: "Melanoma",
  cll: "CLL",
  aml: "AML",
  breast: "Breast",
  prostate: "Prostate",
  bladder: "Bladder",
  ovarian: "Ovarian",
  kidney: "Kidney",
  pancreatic: "Pancreatic",
  "liver-hcc": "Liver/HCC",
};

const HEPATOLOGY_SLUG_TO_LABEL: Record<string, string> = {
  all: "All",
  mash: "MASH",
  pbc: "PBC",
  hcc: "HCC",
  "autoimmune-hepatitis": "Autoimmune Hepatitis",
  nafld: "NAFLD",
};

const RARE_DISEASE_SLUG_TO_LABEL: Record<string, string> = {
  all: "All",
  "fabry-disease": "Fabry Disease",
  "pompe-disease": "Pompe Disease",
  "gaucher-disease": "Gaucher Disease",
  als: "ALS",
  sma: "Spinal Muscular Atrophy",
  "cystic-fibrosis": "Cystic Fibrosis",
};

const IMMUNOLOGY_SLUG_TO_LABEL: Record<string, string> = {
  all: "All",
  "atopic-dermatitis": "Atopic Dermatitis",
  psoriasis: "Psoriasis",
  "rheumatoid-arthritis": "Rheumatoid Arthritis",
  crohns: "Crohn's Disease",
  "ulcerative-colitis": "Ulcerative Colitis",
  lupus: "Lupus",
  "multiple-sclerosis": "Multiple Sclerosis",
};

const INDICATION_SLUG_MAP_BY_TA: Record<string, Record<string, string>> = {
  Oncology: ONCOLOGY_SLUG_TO_LABEL,
  Hepatology: HEPATOLOGY_SLUG_TO_LABEL,
  "Rare Disease": RARE_DISEASE_SLUG_TO_LABEL,
  Immunology: IMMUNOLOGY_SLUG_TO_LABEL,
};

// There is deliberately NO label->slug map here. Inverting a display map made
// the label load-bearing: rename a label and every caller still passing the old
// string silently resolved to "all" instead of failing. Identity flows one way
// now - slug in, label out - and callers hold the slug.

/**
 * TA slug -> display label, or NULL when the slug is not a registered TA.
 *
 * RETURNED HOME_TA ("Oncology") UNTIL 2026-08-30. An unrecognised slug did not fail and did
 * not return the slug - it returned a DIFFERENT REAL TA, which then resolved, queried and
 * rendered a complete, plausible, wrong board. That is the worst available failure: a raw
 * slug on screen announces itself (see taLabels.ts, where returning the key verbatim is the
 * deliberate design), but "Oncology" over colorectal data looks exactly like success.
 *
 * NULL rather than the slug because this value is a LABEL that callers also key on
 * (indicationSlugToLabel, the === "Immunology" compare in HomePage): a slug passed off as a
 * label would silently miss those lookups instead of failing at them. Callers decide what an
 * unknown TA means for their surface - render an absence, fall back explicitly, or refuse.
 */
export function taSlugToLabel(taSlug: string | undefined): string | null {
  if (taSlug && TA_SLUG_TO_LABEL[taSlug]) return TA_SLUG_TO_LABEL[taSlug];
  return null;
}

export function taLabelToSlug(taLabel: string): string {
  return TA_LABEL_TO_SLUG[taLabel] ?? "oncology";
}

/**
 * TA label -> the API/data slug that TA's queries run against, or NULL if unrecognised.
 *
 * DEFAULTED TO "rare-disease" UNTIL 2026-08-30 - an unknown label silently became a real,
 * unrelated TA. Worse than its twin above, because this output is a QUERY KEY, not a
 * displayed string: nothing on the page would have looked wrong. It reaches TA_ID_MAP and
 * filters.therapeuticArea on the feed's hot path (App.tsx fetchHCPs / the feed effect), so
 * the substitution bought a fully-rendered rare-disease board under a colorectal heading.
 *
 * NULL, NOT A THROW. Every call site is inside a render or an effect on the feed; throwing
 * would trade a wrong answer for a blank application, on a branch that auto-deploys. NULL
 * makes the compiler enumerate the consumers instead - the loudest place to fail is the
 * typecheck, not the browser.
 *
 * NULL, NOT THE INPUT UNCHANGED. Returning "Cardiology" as if it were a slug would miss
 * TA_ID_MAP and degrade to an EMPTY feed - quieter than the bug it replaces, not louder.
 * The raw-input convention is right for taLabels.ts, whose output is only ever displayed.
 */
export function taLabelToApiSlug(taLabel: string): string | null {
  switch (taLabel) {
    case "Hepatology":
      return "hepatology";
    case "Oncology":
      return "nsclc";
    case "Rare Disease":
      return "rare-disease";
    case "Immunology":
      return "immunology";
    default:
      return null;
  }
}

export function dashboardSlugToTrack(dashboardSlug: string | undefined): Track {
  if (dashboardSlug && DASHBOARD_SLUG_TO_TRACK[dashboardSlug]) {
    return DASHBOARD_SLUG_TO_TRACK[dashboardSlug];
  }
  return HOME_DASHBOARD;
}

export function trackToDashboardSlug(track: Track): string {
  return TRACK_TO_DASHBOARD_SLUG[track];
}

export function indicationSlugToLabel(taLabel: string, indicationSlug: string): string | null {
  const map = INDICATION_SLUG_MAP_BY_TA[taLabel];
  if (!map) return null;
  return map[indicationSlug.toLowerCase()] ?? null;
}

/**
 * The AREA an indication belongs to — "nsclc" -> "Oncology". Derived by asking
 * the existing per-TA slug maps which one owns the slug; no new table, so it
 * cannot drift from indicationSlugToLabel. "all" is skipped because every TA
 * has one and it identifies nothing.
 *
 * Feeds the hero eyebrow's third segment (SCOPE · TA · AREA).
 */
export function parentTaLabelForIndicationSlug(indicationSlug: string): string | null {
  const key = indicationSlug.trim().toLowerCase();
  if (!key || key === "all") return null;
  for (const [taLabel, map] of Object.entries(INDICATION_SLUG_MAP_BY_TA)) {
    if (map[key]) return taLabel;
  }
  return null;
}

export function getFirstActiveIndicationSlug(taLabel: string): string {
  const options = INDICATIONS_BY_TA[taLabel] ?? [];
  const firstActive = options.find((o) => o.active);
  return firstActive?.slug ?? "all";
}

export function isIndicationDataActive(taLabel: string, indicationSlug: string): boolean {
  const options = INDICATIONS_BY_TA[taLabel] ?? [];
  const match = options.find((o) => o.slug === indicationSlug);
  return match?.active ?? false;
}

export function getIndicationCount(taLabel: string, indicationSlug: string): number | null {
  const options = INDICATIONS_BY_TA[taLabel] ?? [];
  const match = options.find((o) => o.slug === indicationSlug);
  return match?.count ?? null;
}

export function getIndicationTaId(taLabel: string, indicationSlug: string): string | undefined {
  const options = INDICATIONS_BY_TA[taLabel] ?? [];
  const match = options.find((o) => o.slug === indicationSlug);
  return match?.taId;
}

export function resolveIndicationForTa(
  taLabel: string,
  indicationSlug: string | undefined,
  isHomePath: boolean,
): { label: string; slug: string; dataActive: boolean } {
  if (indicationSlug) {
    const slug = indicationSlug.toLowerCase();
    const label = indicationSlugToLabel(taLabel, slug);
    if (label) {
      return { label, slug, dataActive: isIndicationDataActive(taLabel, slug) };
    }
  }

  if (isHomePath && taLabel === HOME_TA) {
    return {
      label: indicationSlugToLabel(taLabel, HOME_INDICATION_SLUG) ?? HOME_INDICATION_SLUG,
      slug: HOME_INDICATION_SLUG,
      dataActive: true,
    };
  }

  const firstActiveSlug = getFirstActiveIndicationSlug(taLabel);
  return {
    label: indicationSlugToLabel(taLabel, firstActiveSlug) ?? firstActiveSlug,
    slug: firstActiveSlug,
    dataActive: true,
  };
}

export function buildFeedPath(taSlug: string, dashboardSlug: string, indicationSlug?: string): string {
  if (dashboardSlug === "field-intelligence") {
    return `/${taSlug}/field-intelligence`;
  }
  const ind = indicationSlug ?? "all";
  return `/${taSlug}/${dashboardSlug}/${ind}`;
}

export function buildHcpDetailPath(hcpId: string): string {
  return `/hcp/${hcpId}`;
}

export interface ResolvedFeedRoute {
  taSlug: string;
  taLabel: string;
  dashboardSlug: string;
  track: Track;
  indicationSlug: string;
  indicationLabel: string;
  indicationDataActive: boolean;
  indicationCount: number | null;
  isHomePath: boolean;
}

export function resolveFeedRoute(params: {
  ta?: string;
  dashboard?: string;
  indication?: string;
  isHomePath?: boolean;
}): ResolvedFeedRoute {
  const isHomePath = Boolean(params.isHomePath);
  const taSlug =
    params.ta && TA_SLUG_TO_LABEL[params.ta] ? params.ta : taLabelToSlug(HOME_TA);
  // taSlug was just validated against TA_SLUG_TO_LABEL on the line above, so the lookup
  // cannot miss. The ?? states that guarantee AT THE SITE THAT MAKES IT, which is the whole
  // difference from the default this replaced: taSlugToLabel used to hand HOME_TA to every
  // caller, including the ones that had validated nothing.
  const taLabel = taSlugToLabel(taSlug) ?? HOME_TA;
  const dashboardSlug =
    params.dashboard && DASHBOARD_SLUG_TO_TRACK[params.dashboard]
      ? params.dashboard
      : trackToDashboardSlug(HOME_DASHBOARD);
  const track = dashboardSlugToTrack(dashboardSlug);

  const indicationResolved = resolveIndicationForTa(taLabel, params.indication, isHomePath);

  return {
    taSlug,
    taLabel,
    dashboardSlug,
    track,
    indicationSlug: indicationResolved.slug,
    indicationLabel: indicationResolved.label,
    indicationDataActive: indicationResolved.dataActive,
    indicationCount: getIndicationCount(taLabel, indicationResolved.slug),
    isHomePath,
  };
}

export function resolveIndicationForTaSwitch(
  newTaLabel: string,
  currentIndicationSlug: string,
): { label: string; slug: string } {
  const slug = isIndicationDataActive(newTaLabel, currentIndicationSlug)
    ? currentIndicationSlug
    : getFirstActiveIndicationSlug(newTaLabel);
  return { label: indicationSlugToLabel(newTaLabel, slug) ?? slug, slug };
}
