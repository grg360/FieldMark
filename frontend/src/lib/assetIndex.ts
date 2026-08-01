// Drug Intelligence — assets index (grouped by target). Design frame 2b.
//
// Roster, targets, group membership, is_backbone and display names come ONLY from
// config (assetConfig.ts). Every measured quantity comes from the database: each
// asset's distinct-publication count (asset_mention_v1), each group's distinct
// union (asset_group_distinct — NOT the sum of members), and each asset's density
// tier (asset_density_tiers — how many of the 7 completed years 2019–2025 clear 40
// themed; 2026 is in progress and excluded from the measure, Rule B). Where config
// and the DB could disagree, config decides which drugs exist and where they sit.

import { supabase } from "./supabase";
import {
  ASSETS,
  DEPLOYMENT_ASSETS,
  BACKBONE_ASSETS,
  assetSlug,
  type AssetConfig,
} from "./assetConfig";
import { NSCLC_CORPUS_TOTAL, CORPUS_INDEX_DATE } from "./assets";

export type DensityTier = "dense" | "intermittent" | "sparse";

// Rule B: measured over the 7 completed years 2019–2025 (2026 excluded from the
// measure). DENSE = clears the gate in all 7; SPARSE = in none; INTERMITTENT = some.
export function densityTier(yearsCleared: number): DensityTier {
  if (yearsCleared >= 7) return "dense";
  if (yearsCleared >= 1) return "intermittent";
  return "sparse";
}

export const DENSITY_GLYPH: Record<DensityTier, string> = {
  dense: "▰▰▰",
  intermittent: "▰▰▱",
  sparse: "▰▱▱",
};
export const DENSITY_LABEL: Record<DensityTier, string> = {
  dense: "DENSE",
  intermittent: "INTERMITTENT",
  sparse: "SPARSE",
};

export interface IndexAssetRow {
  generic: string;
  slug: string;
  n: number; // this asset's distinct publications (all years)
  tier: DensityTier;
  yearsCleared: number;
  alsoTargets: string[]; // other target groups this asset appears in (multi-target)
}

export interface TargetGroup {
  target: string;
  distinctPubs: number; // distinct union across the group — does NOT sum member n
  rows: IndexAssetRow[]; // members, by volume
}

export interface AssetIndexModel {
  targetGroups: TargetGroup[]; // 18, by volume
  backbone: { rows: IndexAssetRow[]; distinctPubs: number; rowSum: number };
  nullNonBackbone: IndexAssetRow[]; // deployment assets with target null (lurbinectedin)
  header: {
    deploymentPubs: number;
    backbonePubs: number;
    allPubs: number;
    corpus: number; // live NSCLC corpus size — computed (asset_index_meta), not hardcoded
    indexDate: string; // real corpus build date (max built_at) — computed, not hardcoded
    overlap: number; // deployment + backbone − all
  };
  legend: Record<DensityTier, number>; // over the 43 deployment assets
  flat: IndexAssetRow[]; // all 43 deployment assets, by volume (Flat view)
  counts: { targetGroups: number; targetedAssets: number; rows: number };
  globalMax: number; // largest single-asset n (for the whole-index bar scale)
}

const DEPLOY_KEY = "__deployment__";
const BACKBONE_KEY = "__backbone__";
const ALL_KEY = "__all__";

function distinctTargets(): string[] {
  const s = new Set<string>();
  for (const a of DEPLOYMENT_ASSETS) if (a.target) a.target.forEach((t) => s.add(t));
  return [...s];
}

export async function loadAssetIndex(): Promise<AssetIndexModel> {
  const targets = distinctTargets();
  const membersByTarget = new Map<string, AssetConfig[]>();
  for (const t of targets) {
    membersByTarget.set(
      t,
      DEPLOYMENT_ASSETS.filter((a) => a.target?.includes(t)),
    );
  }

  // Groups sent to the distinct-union RPC: the 18 targets + the three header scopes.
  const groupsArg = [
    ...targets.map((t) => ({ key: t, generics: membersByTarget.get(t)!.map((a) => a.generic) })),
    { key: DEPLOY_KEY, generics: DEPLOYMENT_ASSETS.map((a) => a.generic) },
    { key: BACKBONE_KEY, generics: BACKBONE_ASSETS.map((a) => a.generic) },
    { key: ALL_KEY, generics: ASSETS.map((a) => a.generic) },
  ];

  const [mentionRes, groupRes, densityRes, metaRes] = await Promise.all([
    supabase.from("asset_mention_v1").select("asset_generic, publication_count"),
    supabase.rpc("asset_group_distinct", { p_groups: groupsArg }),
    supabase.rpc("asset_density_tiers"),
    // Computed corpus meta — real build date (max built_at) + live NSCLC corpus count.
    // Falls back to the assets.ts constants only if the RPC is unavailable.
    supabase.rpc("asset_index_meta"),
  ]);

  const metaRow = (Array.isArray(metaRes.data) ? metaRes.data[0] : metaRes.data) as
    | { index_date?: string; corpus_total?: number | string }
    | undefined;
  const indexDate = metaRow?.index_date || CORPUS_INDEX_DATE;
  const corpus = Number(metaRow?.corpus_total) || NSCLC_CORPUS_TOTAL;

  const nByGeneric = new Map<string, number>();
  for (const r of mentionRes.data ?? []) {
    nByGeneric.set(r.asset_generic as string, Number(r.publication_count) || 0);
  }
  const groupDistinct: Record<string, number> = (groupRes.data as Record<string, number>) ?? {};
  const yearsByGeneric: Record<string, number> = (densityRes.data as Record<string, number>) ?? {};

  const rowFor = (a: AssetConfig, inTarget?: string): IndexAssetRow => {
    const yrs = yearsByGeneric[a.generic] ?? 0;
    return {
      generic: a.generic,
      slug: assetSlug(a.generic),
      n: nByGeneric.get(a.generic) ?? 0,
      tier: densityTier(yrs),
      yearsCleared: yrs,
      alsoTargets: inTarget && a.target ? a.target.filter((t) => t !== inTarget) : [],
    };
  };

  const targetGroups: TargetGroup[] = targets
    .map((t) => ({
      target: t,
      distinctPubs: groupDistinct[t] ?? 0,
      rows: membersByTarget.get(t)!.map((a) => rowFor(a, t)).sort((x, y) => y.n - x.n),
    }))
    .sort((a, b) => b.distinctPubs - a.distinctPubs);

  const backboneRows = BACKBONE_ASSETS.map((a) => rowFor(a)).sort((x, y) => y.n - x.n);
  const nullNonBackbone = DEPLOYMENT_ASSETS.filter((a) => a.target == null).map((a) => rowFor(a));

  const legend: Record<DensityTier, number> = { dense: 0, intermittent: 0, sparse: 0 };
  for (const a of DEPLOYMENT_ASSETS) legend[densityTier(yearsByGeneric[a.generic] ?? 0)]++;

  const flat = DEPLOYMENT_ASSETS.map((a) => rowFor(a)).sort((x, y) => y.n - x.n);
  const globalMax = Math.max(1, ...flat.map((r) => r.n));

  return {
    targetGroups,
    backbone: {
      rows: backboneRows,
      distinctPubs: groupDistinct[BACKBONE_KEY] ?? 0,
      rowSum: backboneRows.reduce((s, r) => s + r.n, 0),
    },
    nullNonBackbone,
    header: {
      deploymentPubs: groupDistinct[DEPLOY_KEY] ?? 0,
      backbonePubs: groupDistinct[BACKBONE_KEY] ?? 0,
      allPubs: groupDistinct[ALL_KEY] ?? 0,
      corpus,
      indexDate,
      overlap:
        (groupDistinct[DEPLOY_KEY] ?? 0) + (groupDistinct[BACKBONE_KEY] ?? 0) - (groupDistinct[ALL_KEY] ?? 0),
    },
    legend,
    flat,
    counts: {
      targetGroups: targetGroups.length,
      targetedAssets: DEPLOYMENT_ASSETS.filter((a) => a.target != null).length,
      rows: targetGroups.reduce((s, g) => s + g.rows.length, 0),
    },
    globalMax,
  };
}
