// Trials surface data layer — /trials. Frame: docs/design/Trials Surface.dc.html.
//
// Reads SET 1 (open NSCLC-lung trials naming >=1 ranked investigator) from the RPC
// get_nsclc_trials_surface(), which is defined over the GATED, deduped view
// trial_investigators_rendered_v1 (>=80 confidence) — never trial_investigators_v2.
// Every figure here is DERIVED live from that set, so the header count is whatever
// SET 1 is on the day. No fixed numbers, no bulk noInvs / roster-asset tier.
//
// TERRITORY: the platform's established 5-region model (us-regions.ts / the feed's
// TERRITORY_STATES), NOT a new 11-region map. A trial's regions are the regions of
// its ranked investigators' practice states; investigators with a NULL practice
// state resolve to no region, so every regional count is a FLOOR and such trials
// fall into the unresolved remainder (the frame's coverage caveat, data-grounded).

import { supabase } from "./supabase";
import { ASSETS, assetSlug, type AssetConfig } from "./assetConfig";
import { subRegionForState, US_SUB_REGION_ORDER, type USSubRegionKey } from "./us-regions";

// ── roster-asset matcher: exact intervention name -> asset (lowercased) ──────────
const ROSTER_BY_NAME = new Map<string, AssetConfig>();
for (const a of ASSETS) {
  const m = a.match ?? { names: [], brands: [], codes: [] };
  for (const n of [a.generic, ...(m.names ?? []), ...(m.brands ?? []), ...(m.codes ?? [])]) {
    const k = (n ?? "").trim().toLowerCase();
    if (k) ROSTER_BY_NAME.set(k, a);
  }
}

export interface TrialInvestigator {
  hcp_id: string;
  name: string | null;
  state: string | null;
  institution: string | null;
  cohort: string;
  rank: number | null;
  confidence: number;
}
export interface RawTrial {
  trial_id: string;
  nct_id: string;
  title: string | null;
  phase: string | null;
  status: string | null;
  sponsor: string | null;
  lead_sponsor_class: string | null;
  start_date: string | null;
  completion_date: string | null;
  interventions: { name: string; type?: string }[] | null;
  investigators: TrialInvestigator[] | null;
}

export interface InterventionTag {
  name: string;
  roster: boolean;
  slug: string | null; // /assets/:slug when roster; null otherwise (plain text)
}
export interface Trial {
  raw: RawTrial;
  nctId: string;
  title: string;
  phaseLabel: string;
  statusLabel: string;
  recruiting: boolean;
  sponsor: string;
  sponsorClassLabel: string;
  industry: boolean;
  dates: string;
  investigators: TrialInvestigator[];
  interventions: InterventionTag[];
  rosterAssets: string[]; // generics of roster assets on this trial
  regions: USSubRegionKey[]; // regions this trial resolves into (may be empty = unresolved)
  hasResolvedRegion: boolean;
}

export interface Territory {
  key: "ALL US" | USSubRegionKey;
  count: number;
}
export interface TrialsSurface {
  trials: Trial[];
  openCount: number;
  industryCount: number;
  rosterAssetsOnTrial: number; // distinct roster assets appearing across the set
  rosterAssetsTotal: number; // 51
  phaseDist: { label: string; n: number }[];
  statusDist: { label: string; n: number }[];
  territories: Territory[];
  resolvedTrials: number; // trials with >=1 investigator in a resolvable region
  unresolvedTrials: number; // trials with no resolvable region (the floor caveat)
}

const OPEN_STATUS_LABEL: Record<string, string> = {
  RECRUITING: "RECRUITING",
  ACTIVE_NOT_RECRUITING: "ACTIVE, NOT RECRUITING",
  ENROLLING_BY_INVITATION: "ENROLLING BY INVITATION",
};

// Sponsor class → display. The registry class is coarse; INDUSTRY is exact, the rest
// is labelled honestly rather than guessed into "academic/cooperative".
function sponsorClassLabel(cls: string | null): string {
  switch ((cls ?? "").toUpperCase()) {
    case "INDUSTRY": return "INDUSTRY";
    case "NIH": case "FED": case "OTHER_GOV": return "GOVERNMENT";
    case "NETWORK": return "COOPERATIVE GROUP";
    case "OTHER": return "ACADEMIC / OTHER";
    default: return (cls ?? "").replace(/_/g, " ") || "—";
  }
}

function phaseLabel(phase: string | null): string {
  const p = (phase ?? "").toUpperCase().replace(/\s/g, "");
  if (!p || p === "NA") return "N/A";
  if (p === "EARLY_PHASE1") return "EARLY PHASE 1";
  if (p === "PHASE1;PHASE2") return "PHASE 1/2";
  if (p === "PHASE2;PHASE3") return "PHASE 2/3";
  const m = p.match(/^PHASE(\d)$/);
  return m ? `PHASE ${m[1]}` : (phase ?? "N/A");
}

function fmtDates(start: string | null, completion: string | null): string {
  const mo = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso + "T00:00:00");
    return `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
  };
  const s = mo(start), c = mo(completion);
  if (s && c) return `${s} → est. ${c}`;
  if (s) return s;
  if (c) return `est. ${c}`;
  return "";
}

function tagInterventions(ivs: RawTrial["interventions"]): InterventionTag[] {
  const seen = new Set<string>();
  const out: InterventionTag[] = [];
  for (const iv of ivs ?? []) {
    const name = (iv?.name ?? "").trim();
    if (!name) continue;
    const asset = ROSTER_BY_NAME.get(name.toLowerCase());
    const label = asset ? asset.generic : name;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ name: label, roster: !!asset, slug: asset ? assetSlug(asset.generic) : null });
  }
  // roster assets first (amber links), then plain text
  return out.sort((a, b) => Number(b.roster) - Number(a.roster));
}

function toTrial(raw: RawTrial): Trial {
  const invs = raw.investigators ?? [];
  const interventions = tagInterventions(raw.interventions);
  const regionSet = new Set<USSubRegionKey>();
  for (const iv of invs) {
    const r = iv.state ? subRegionForState(iv.state) : null;
    if (r) regionSet.add(r);
  }
  const regions = US_SUB_REGION_ORDER.filter((r) => regionSet.has(r));
  const cls = raw.lead_sponsor_class;
  return {
    raw,
    nctId: raw.nct_id,
    title: raw.title ?? raw.nct_id,
    phaseLabel: phaseLabel(raw.phase),
    statusLabel: OPEN_STATUS_LABEL[(raw.status ?? "").toUpperCase()] ?? (raw.status ?? ""),
    recruiting: (raw.status ?? "").toUpperCase() === "RECRUITING",
    sponsor: raw.sponsor ?? "—",
    sponsorClassLabel: sponsorClassLabel(cls),
    industry: (cls ?? "").toUpperCase() === "INDUSTRY",
    dates: fmtDates(raw.start_date, raw.completion_date),
    investigators: invs,
    interventions,
    rosterAssets: interventions.filter((i) => i.roster).map((i) => i.name),
    regions,
    hasResolvedRegion: regions.length > 0,
  };
}

function distribution(items: string[], order?: string[]): { label: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  const keys = order ? order.filter((k) => counts.has(k)) : [...counts.keys()];
  const extra = order ? [...counts.keys()].filter((k) => !order.includes(k)) : [];
  return [...keys, ...extra].map((label) => ({ label, n: counts.get(label) ?? 0 }));
}

// Build the surface, optionally scoped to a single region (a territory filter).
export function buildSurface(all: Trial[], region: USSubRegionKey | null): TrialsSurface {
  const trials = region ? all.filter((t) => t.regions.includes(region)) : all;

  const rosterOnTrial = new Set<string>();
  for (const t of trials) for (const a of t.rosterAssets) rosterOnTrial.add(a);

  const territories: Territory[] = [
    { key: "ALL US", count: all.length },
    ...US_SUB_REGION_ORDER.map((r) => ({ key: r, count: all.filter((t) => t.regions.includes(r)).length })),
  ];

  const resolved = trials.filter((t) => t.hasResolvedRegion).length;

  return {
    trials,
    openCount: trials.length,
    industryCount: trials.filter((t) => t.industry).length,
    rosterAssetsOnTrial: rosterOnTrial.size,
    rosterAssetsTotal: ASSETS.length,
    phaseDist: distribution(trials.map((t) => t.phaseLabel), ["PHASE 1", "PHASE 1/2", "PHASE 2", "PHASE 2/3", "PHASE 3", "EARLY PHASE 1", "N/A"]),
    statusDist: distribution(trials.map((t) => t.statusLabel), ["RECRUITING", "ACTIVE, NOT RECRUITING", "ENROLLING BY INVITATION"]),
    territories,
    resolvedTrials: resolved,
    unresolvedTrials: trials.length - resolved,
  };
}

export async function fetchTrials(): Promise<Trial[]> {
  const { data, error } = await supabase.rpc("get_nsclc_trials_surface");
  if (error) {
    console.warn("fetchTrials: RPC error", error);
    return [];
  }
  return ((data ?? []) as RawTrial[]).map(toTrial);
}

export const REGION_ORDER = US_SUB_REGION_ORDER;
export type Region = USSubRegionKey;
