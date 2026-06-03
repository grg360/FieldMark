import type { Track } from "./TrackContext";
import { INDICATIONS_BY_TA } from "../components/IndicationFilter";

export const HOME_TA = "Oncology";
export const HOME_INDICATION = "NSCLC";
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
  telescope: "telescope",
  "field-intelligence": "field-intelligence",
};

export const DASHBOARD_SLUG_TO_TRACK: Record<string, Track> = {
  established: "established",
  community: "community",
  "rising-stars": "rising-stars",
  social: "social",
  telescope: "telescope",
  "field-intelligence": "field-intelligence",
};

const ONCOLOGY_SLUG_TO_LABEL: Record<string, string> = {
  all: "All",
  nsclc: "NSCLC",
  "car-t": "CAR-T",
  dlbcl: "DLBCL",
  melanoma: "Melanoma",
  cll: "CLL",
  aml: "AML",
  breast: "Breast",
  prostate: "Prostate",
  colorectal: "Colorectal",
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

function invertMap(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, label] of Object.entries(map)) {
    out[label] = slug;
  }
  return out;
}

const INDICATION_LABEL_TO_SLUG_BY_TA: Record<string, Record<string, string>> = {
  Oncology: invertMap(ONCOLOGY_SLUG_TO_LABEL),
  Hepatology: invertMap(HEPATOLOGY_SLUG_TO_LABEL),
  "Rare Disease": invertMap(RARE_DISEASE_SLUG_TO_LABEL),
  Immunology: invertMap(IMMUNOLOGY_SLUG_TO_LABEL),
};

export function taSlugToLabel(taSlug: string | undefined): string {
  if (taSlug && TA_SLUG_TO_LABEL[taSlug]) return TA_SLUG_TO_LABEL[taSlug];
  return HOME_TA;
}

export function taLabelToSlug(taLabel: string): string {
  return TA_LABEL_TO_SLUG[taLabel] ?? "oncology";
}

export function taLabelToApiSlug(taLabel: string): string {
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
      return "rare-disease";
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

export function indicationLabelToSlug(taLabel: string, indicationLabel: string): string {
  const map = INDICATION_LABEL_TO_SLUG_BY_TA[taLabel];
  if (!map) return "all";
  return map[indicationLabel] ?? "all";
}

export function getFirstActiveIndicationLabel(taLabel: string): string {
  const options = INDICATIONS_BY_TA[taLabel] ?? [{ label: "All", active: true }];
  const firstActive = options.find((o) => o.active);
  return firstActive?.label ?? "All";
}

export function isIndicationDataActive(taLabel: string, indicationLabel: string): boolean {
  const options = INDICATIONS_BY_TA[taLabel] ?? [];
  const match = options.find((o) => o.label === indicationLabel);
  return match?.active ?? false;
}

export function getIndicationCount(taLabel: string, indicationLabel: string): number | null {
  const options = INDICATIONS_BY_TA[taLabel] ?? [];
  const match = options.find((o) => o.label === indicationLabel);
  return match?.count ?? null;
}

export function resolveIndicationForTa(
  taLabel: string,
  indicationSlug: string | undefined,
  isHomePath: boolean,
): { label: string; slug: string; dataActive: boolean } {
  if (indicationSlug) {
    const label = indicationSlugToLabel(taLabel, indicationSlug);
    if (label) {
      return {
        label,
        slug: indicationSlug.toLowerCase(),
        dataActive: isIndicationDataActive(taLabel, label),
      };
    }
  }

  if (isHomePath && taLabel === HOME_TA) {
    return {
      label: HOME_INDICATION,
      slug: "nsclc",
      dataActive: true,
    };
  }

  const firstActive = getFirstActiveIndicationLabel(taLabel);
  return {
    label: firstActive,
    slug: indicationLabelToSlug(taLabel, firstActive),
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

export function buildFieldIntelligenceThreadPath(taSlug: string, threadId: string): string {
  return `/${taSlug}/field-intelligence/thread/${threadId}`;
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
  const taLabel = taSlugToLabel(taSlug);
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
    indicationCount: getIndicationCount(taLabel, indicationResolved.label),
    isHomePath,
  };
}

export function resolveIndicationForTaSwitch(
  newTaLabel: string,
  currentIndicationLabel: string,
): { label: string; slug: string } {
  if (isIndicationDataActive(newTaLabel, currentIndicationLabel)) {
    return {
      label: currentIndicationLabel,
      slug: indicationLabelToSlug(newTaLabel, currentIndicationLabel),
    };
  }
  const label = getFirstActiveIndicationLabel(newTaLabel);
  return { label, slug: indicationLabelToSlug(newTaLabel, label) };
}
