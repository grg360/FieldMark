// Practice-first community profile — data layer. Frame authority:
// docs/design/Community HCP Profile Practice First.dc.html.
//
// community_practice_profile RPC (see migration 2026_07_30) carries the practice-reality
// sections; the engagement/score/mix/entities/narrative sections reuse the existing
// community_hcp_profile payload. The paid-vs-administered overlay is computed HERE from:
//   paid side  → community profile products (Open Payments by-drug, brand names)
//   admin side → RPC admin_codes (top_hcpcs_codes joined to ta_hcpcs_codes; rank order
//                only — per-code beneficiaries/services/dollars are NOT retained)
//   route      → config/assets.json (NSCLC assets, `route`) plus config/drug_routes.json
//                (curated brand→route/generic reference for non-NSCLC paid brands).
//                A brand in neither reference renders as ROUTE UNKNOWN — never guessed.

import { supabase } from "./supabase";
import { ASSETS } from "./assetConfig";
import routesRaw from "../../../config/drug_routes.json";
import type { Product } from "./communityProfile";

export interface AdminCode {
  code: string;
  ord: number;
  name: string | null; // ta_hcpcs_codes.code_description — null = honest name gap
  category: string | null; // ta_hcpcs_codes.code_category
}

export interface PracticeProfile {
  has_medicare: boolean;
  medicare: {
    benes_2021: number | null;
    benes_2022: number | null;
    benes_2023: number | null;
    beneficiary_years_3yr: number | null; // SUM of annual counts — beneficiary-YEARS, not people
    unique_benes_est: number | null;
    services_3yr: number | null;
    medicare_paid_3yr: number | null; // DEFECTIVE legacy figure — never display; use medicare_paid_corrected
    medicare_paid_corrected: number | null; // Σ total_paid_est all codes — the real figure
    distinct_codes_3yr: number | null;
    benes_yoy_trend_pct: number | null;
    place_of_service: string | null;
    ruca: string | null;
  } | null;
  nppes: {
    organization: string | null;
    co_located_npis: number | null;
    career_stage: string | null;
  } | null;
  admin_codes: AdminCode[];
  coverage: {
    medicare: number;
    nppes: number;
    open_payments: number;
    publications: number;
    hcpcs_named: number;
  } | null;
}

export async function loadPracticeProfile(hcpId: string): Promise<PracticeProfile | null> {
  const { data, error } = await supabase.rpc("community_practice_profile", { p_hcp_id: hcpId });
  if (error || !data) {
    console.error("community_practice_profile failed:", error?.message);
    return null;
  }
  return data as PracticeProfile;
}

// ── Route / overlay classification ───────────────────────────────────────────

interface RouteRef { generic: string; route: "oral" | "IV" | "SC"; maker?: string }

const CURATED: Record<string, RouteRef> = (routesRaw as { routes: Record<string, RouteRef> }).routes;

// assets.json brand → {generic, route}
const ASSET_BY_BRAND: Record<string, RouteRef> = {};
for (const a of ASSETS) {
  if (a.route !== "oral" && a.route !== "IV" && a.route !== "SC") continue;
  for (const b of a.brand_names ?? []) {
    ASSET_BY_BRAND[b.toUpperCase()] = { generic: a.generic ?? b, route: a.route as RouteRef["route"] };
  }
}

export function routeRef(brand: string | null | undefined): RouteRef | null {
  if (!brand) return null;
  const key = brand.toUpperCase().trim();
  return CURATED[key] ?? ASSET_BY_BRAND[key] ?? null;
}

/** Generic tokens of the administered (mapped) top codes: "Pembrolizumab injection" →
 *  "pembrolizumab". Only mapped names contribute — gaps can't match anything. */
export function administeredGenerics(codes: AdminCode[]): Map<string, AdminCode> {
  const m = new Map<string, AdminCode>();
  for (const c of codes) {
    if (!c.name || c.category !== "drug_admin") continue;
    const g = c.name.toLowerCase()
      .replace(/\s+(injection|injectable|protein-bound)\b.*$/, "")
      .trim();
    if (g) m.set(g, c);
  }
  return m;
}

export type OverlayClass = "aligned" | "oral" | "injectable_none" | "route_unknown";

export interface ClassifiedProduct {
  product: Product;
  ref: RouteRef | null;
  cls: OverlayClass;
  matchedCode: AdminCode | null; // set when aligned — which top code carried it
}

/** The cross-domain overlay: paid brands × administered generics, split by route.
 *  IMPORTANT LIMIT (stated in the UI): the administered side is the record's TOP-10
 *  HCPCS codes, not the full 130-code claim set — "aligned" means "appears in his top
 *  codes", and its absence is weaker evidence than the frame's mock implied. */
export function classifyProducts(products: Product[], codes: AdminCode[]): ClassifiedProduct[] {
  const admin = administeredGenerics(codes);
  return products.map((p) => {
    const ref = routeRef(p.drug);
    let matchedCode: AdminCode | null = null;
    if (ref) {
      const gen = ref.generic.toLowerCase();
      for (const [g, c] of admin) {
        if (gen.includes(g) || g.includes(gen)) { matchedCode = c; break; }
      }
    }
    const cls: OverlayClass = matchedCode
      ? "aligned"
      : ref
        ? (ref.route === "oral" ? "oral" : "injectable_none")
        : "route_unknown";
    return { product: p, ref, cls, matchedCode };
  });
}

export const RUCA_LABEL: Record<string, string> = {
  "1": "Metropolitan core", "2": "Metropolitan, high commuting", "3": "Metropolitan, low commuting",
  "4": "Micropolitan core", "5": "Micropolitan, high commuting", "6": "Micropolitan, low commuting",
  "7": "Small town core", "8": "Small town, high commuting", "9": "Small town, low commuting",
  "10": "Rural",
};

export function rucaLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return RUCA_LABEL[String(code).trim()] ?? `RUCA ${code}`;
}

export function placeOfServiceLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (c === "O") return "Office";
  if (c === "F") return "Facility";
  return code;
}
