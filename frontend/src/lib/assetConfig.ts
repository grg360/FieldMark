// Drug Intelligence — asset identity.
//
// config/assets.json (repo root) is the pipeline-authored source of record — 51
// NSCLC assets with identity, match vocabulary and the backbone flag. The frontend
// imports it directly (same pattern as congresses.ts) so there is one copy, no
// drift. Everything here is pure: identity lookup, the deployment/backbone split
// and the slug scheme. Counts and everything measured come from the database, not
// this file.

import raw from "../../../config/assets.json";

export interface AssetMatch {
  names: string[];
  brands: string[];
  codes: string[];
}

export interface AssetConfig {
  generic: string;
  brand_names: string[];
  development_codes: string[];
  display_code: string | null;
  drug_class: string;
  route: string;
  first_approval_year: number | null;
  nsclc_indication_count: number | null;
  is_backbone: boolean;
  // Controlled-vocabulary molecular target(s); array for multi-target agents, null
  // where no molecular target exists (backbone chemo, and lurbinectedin). Never
  // key group membership on this being null — key on is_backbone. See the config
  // commit and [[asset-target-field]].
  target: string[] | null;
  match: AssetMatch;
  /** Present only where the match vocabulary overlaps another asset (paclitaxel
   *  ↔ nab-paclitaxel). Surfaced verbatim in "What this page counted". */
  match_note?: string;
}

interface AssetsFile {
  therapeutic_area: string;
  corpus_note: string;
  assets: AssetConfig[];
}

const FILE = raw as AssetsFile;

export const ASSETS: AssetConfig[] = FILE.assets;
export const CORPUS_NOTE: string = FILE.corpus_note;

// The one cross-asset quantity the axis knows about besides volume: which drugs
// are platinum-doublet backbone (8) vs field deployment assets (43).
export const DEPLOYMENT_ASSETS: AssetConfig[] = ASSETS.filter((a) => !a.is_backbone);
export const BACKBONE_ASSETS: AssetConfig[] = ASSETS.filter((a) => a.is_backbone);

// ── Slugs ────────────────────────────────────────────────────────────────────
// Lowercase generic, spaces → hyphens. "Trastuzumab deruxtecan" → "trastuzumab-
// deruxtecan". Reversible against the config by exact-slug match.
export function assetSlug(generic: string): string {
  return generic.toLowerCase().replace(/\s+/g, "-");
}

const BY_SLUG: Record<string, AssetConfig> = Object.fromEntries(
  ASSETS.map((a) => [assetSlug(a.generic), a]),
);

const BY_GENERIC: Record<string, AssetConfig> = Object.fromEntries(
  ASSETS.map((a) => [a.generic, a]),
);

export function assetBySlug(slug: string): AssetConfig | undefined {
  return BY_SLUG[slug.toLowerCase()];
}

export function assetByGeneric(generic: string): AssetConfig | undefined {
  return BY_GENERIC[generic];
}

// The exact strings this asset matched on, in one flat list, for the
// "What this page counted" line. Order: generic/other names, then brands, then
// dev codes — the reading order a scientist scans.
export function matchTerms(a: AssetConfig): string[] {
  return [...a.match.names, ...a.match.brands, ...a.match.codes];
}

// Identity subtitle beneath the asset title, e.g.
// "3rd-generation EGFR TKI · oral · AZD9291 · first approval 2015 · 4 NSCLC indications".
// Each segment is dropped when its datum is absent rather than printed empty.
export function identityLine(a: AssetConfig): string {
  const parts: string[] = [a.drug_class, a.route];
  if (a.display_code) parts.push(a.display_code);
  if (a.first_approval_year) parts.push(`first approval ${a.first_approval_year}`);
  if (a.nsclc_indication_count != null) {
    parts.push(
      `${a.nsclc_indication_count} NSCLC indication${a.nsclc_indication_count === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}
