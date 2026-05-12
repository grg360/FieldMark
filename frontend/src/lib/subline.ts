const SPECIALTY_NOISE = new Set(
  [
    "Internal Medicine",
    "Hepatology",
    "Medical Oncology",
    "Cardiology",
    "Surgery",
    "Pediatrics",
    "Anesthesiology",
    "Radiology",
    "Pathology",
    "Family Medicine",
    "Emergency Medicine",
    "Obstetrics and Gynecology",
    "Gastroenterology",
    "Neurology",
    "Psychiatry",
    "Dermatology",
    "Urology",
  ].map((s) => s.toLowerCase()),
);

const TITLE_FRAGMENTS = new Set(
  ["Assistant Professor", "Associate Professor", "Professor"].map((s) => s.toLowerCase()),
);

const INSTITUTION_MARKERS = [
  "hospital",
  "clinic",
  "center",
  "university",
  "medical",
  "school",
  "institute",
  "college",
  "health system",
] as const;

const PRACTICE_SETTING_LABELS: Record<string, string> = {
  academic_medical_center: "Academic Medical Center",
  hospital_affiliated: "Hospital-Affiliated Practice",
  group_practice: "Group Practice",
  solo_practice: "Solo Practice",
};

export type BuildSublineHcp = {
  institution?: string | null;
  institutionShort?: string | null;
  institution_short?: string | null;
  nppesPracticeCity?: string | null;
  nppesPracticeState?: string | null;
  nppesPracticeSetting?: string | null;
  nppes_practice_city?: string | null;
  nppes_practice_state?: string | null;
  nppes_practice_setting?: string | null;
};

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim();
}

function titleCaseCity(city: string): string {
  const t = city.trim();
  if (!t) return "";
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      if (!w) return "";
      const parts = w.split("-").map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""));
      return parts.join("-");
    })
    .join(" ");
}

function formatCityState(
  cityRaw: string,
  stateRaw: string,
): { locationPart: string } {
  const cityT = titleCaseCity(cityRaw);
  const stateT = stateRaw.trim();
  if (cityT && stateT) return { locationPart: `${cityT}, ${stateT}` };
  if (cityT) return { locationPart: cityT };
  if (stateT) return { locationPart: stateT };
  return { locationPart: "" };
}

function hasInstitutionMarker(lower: string): boolean {
  return INSTITUTION_MARKERS.some((m) => lower.includes(m));
}

function isTitleFragmentNoise(lower: string): boolean {
  for (const frag of TITLE_FRAGMENTS) {
    if (lower === frag) return true;
    if (lower.startsWith(`${frag} `) || lower.startsWith(`${frag},`)) return true;
  }
  return false;
}

function isCleanInstitutionShort(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (SPECIALTY_NOISE.has(lower)) return false;
  if (isTitleFragmentNoise(lower)) return false;
  if (lower.startsWith("and ")) return false;
  if (!hasInstitutionMarker(lower)) return false;
  return true;
}

function practiceSettingLabel(settingRaw: string): string | null {
  const k = settingRaw.trim().toLowerCase();
  if (!k || k === "unknown") return null;
  return PRACTICE_SETTING_LABELS[k] ?? null;
}

/**
 * Normalized affiliation subline: institution when “clean”, else practice setting,
 * always appending City, State when available.
 */
export function buildSubline(hcp: BuildSublineHcp): string {
  const rawShort = norm(hcp.institutionShort ?? hcp.institution_short);
  const legacy = norm(hcp.institution);
  const affil = rawShort || legacy;

  const city = norm(hcp.nppesPracticeCity ?? hcp.nppes_practice_city);
  const state = norm(hcp.nppesPracticeState ?? hcp.nppes_practice_state);
  const settingRaw = norm(hcp.nppesPracticeSetting ?? hcp.nppes_practice_setting);

  const { locationPart } = formatCityState(city, state);

  if (!locationPart) {
    if (affil) return affil;
    const labelOnly = practiceSettingLabel(settingRaw);
    return labelOnly ?? "";
  }

  if (isCleanInstitutionShort(affil)) {
    return `${affil}, ${locationPart}`;
  }

  const label = practiceSettingLabel(settingRaw);
  if (label) {
    return `${label}, ${locationPart}`;
  }

  return locationPart;
}
