// Drug Intelligence — asset data layer.
//
// Identity comes from config (assetConfig.ts); every measured quantity comes from
// the database. The heavy per-asset aggregations (composition, landing papers,
// authors) are read-only SECURITY DEFINER RPCs — PostgREST can't group across the
// un-FK'd v1 tables, and the rules (themed denominator, per-asset window, gate)
// belong in one place. Pure display logic lives in assetLogic.ts.

import { supabase } from "./supabase";
import {
  ASSETS,
  BACKBONE_ASSETS,
  DEPLOYMENT_ASSETS,
  assetByGeneric,
  assetSlug,
  type AssetConfig,
} from "./assetConfig";

// ── The indexed snapshot ─────────────────────────────────────────────────────
// FALLBACK ONLY. The Drugs Index now derives both values live from the data via the
// asset_index_meta() RPC (index_date = max(built_at) on asset_publication_v1; corpus =
// live count of NSCLC-ingest publications_v2) — see loadAssetIndex(). These constants are
// used only if that RPC is unavailable, and no longer need manual refreshing.
export const NSCLC_CORPUS_TOTAL = 85302;
export const CORPUS_INDEX_DATE = "2026-07-24";
export const CORPUS_MAX_YEAR = 2026; // ahead-of-print records dated later are capped here

export function formatIndexDate(iso: string = CORPUS_INDEX_DATE): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Index ────────────────────────────────────────────────────────────────────
export interface AssetIndexRow {
  generic: string;
  slug: string;
  publicationCount: number;
  isBackbone: boolean;
}

export interface AssetIndex {
  deployment: AssetIndexRow[]; // 43 field assets, by volume
  backbone: AssetIndexRow[]; // 8 platinum-doublet agents, kept separate
  totalAssets: number;
  totalRecords: number; // sum of the shown assets' publication counts
}

function toRow(a: AssetConfig, count: number): AssetIndexRow {
  return {
    generic: a.generic,
    slug: assetSlug(a.generic),
    publicationCount: count,
    isBackbone: a.is_backbone,
  };
}

export async function getAssetIndex(): Promise<AssetIndex> {
  const { data, error } = await supabase
    .from("asset_mention_v1")
    .select("asset_generic, publication_count");
  if (error) {
    console.error("Failed to load asset mentions:", error);
  }
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    counts.set(r.asset_generic as string, Number(r.publication_count) || 0);
  }

  const deployment = DEPLOYMENT_ASSETS.map((a) => toRow(a, counts.get(a.generic) ?? 0)).sort(
    (x, y) => y.publicationCount - x.publicationCount,
  );
  const backbone = BACKBONE_ASSETS.map((a) => toRow(a, counts.get(a.generic) ?? 0)).sort(
    (x, y) => y.publicationCount - x.publicationCount,
  );

  const totalRecords =
    deployment.reduce((s, r) => s + r.publicationCount, 0) +
    backbone.reduce((s, r) => s + r.publicationCount, 0);

  return {
    deployment,
    backbone,
    totalAssets: ASSETS.length,
    totalRecords,
  };
}

export { assetByGeneric, assetSlug };
