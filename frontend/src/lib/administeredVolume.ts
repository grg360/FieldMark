// Medicare Administered Therapy — data layer. Reads hcp_administered_therapy (a
// SECURITY DEFINER RPC over hcp_hcpcs_detail scoped to the office-administered infused
// oncology agents: NSCLC ta_hcpcs_codes drug_admin J/Q codes, minus denosumab J0897 and
// leuprolide J9217). The RPC returns raw per-(code, year) cells; the molecule merge and
// shaping happen here.
//
// This block is the observed infused-oncology footprint and nothing more. CMS claims
// carry no indication field, so no figure here is attributed to a tumour type — the two
// per-agent badges describe the DRUG's labelled use, never the physician's case mix.
// Absence of a drug-year means fewer than 11 reported Medicare beneficiaries that year,
// never zero. See docs/design/MEDICARE_ATTRIBUTION_SIGNAL.md.

import { supabase } from "./supabase";

// CMS suppresses any provider-drug-year cell under this many beneficiaries.
export const REPORTING_FLOOR = 11;

// Community NSCLC HCPs with facility billing and no office drug rows — the block is empty
// for them because of where the bill was filed, not low activity. Documented constant
// from the 2026-08-04 coverage audit (docs/design/MEDICARE_ATTRIBUTION_SIGNAL.md §2);
// refresh if that audit is re-run. Not a magic number.
export const FACILITY_ONLY_HCP_COUNT = 21474;

export type AgentBadge = "nsclc_anchored" | "thoracic_enriched";

export interface YearCell {
  year: number;
  benes: number | null; // null → under the reporting floor that year (fewer than 11)
  days: number | null; // administration days (total_bene_day_services); null → under floor
  products: string[]; // brand/biosimilar labels contributing this molecule-year
}

export interface AgentRow {
  molecule: string;
  codes: string[]; // distinct HCPCS codes merged into this molecule
  multiProduct: boolean; // more than one product code across the window
  badge: AgentBadge | null;
  cells: YearCell[]; // one per window year, in order; benes/days null = under floor
  recentBenes: number; // most recent year's reported beneficiaries (ordering key); 0 if under floor
  recentDays: number; // most recent year's administration days (bar length); 0 if under floor
  yearsReported: number; // window years with a reported cell
}

export interface AdministeredTherapy {
  // no_npi (2026-08-10): the record has no matched NPI, so Part B cannot be
  // read AT ALL — a different absence from no_claims (NPI present, nothing
  // reportable). Conflating them made the no_claims copy assert facts about
  // "this NPI" for HCPs who have none.
  state: "reported" | "no_claims" | "no_npi";
  windowYears: number[]; // filled min..max, e.g. [2021, 2022, 2023]
  productCount: number; // distinct HCPCS codes reported
  agentRowCount: number; // distinct molecules
  cellCount: number; // reported provider-drug-year cells
  maxRecentDays: number; // bar scale — max recent-year days in the rendered set
  rows: AgentRow[]; // ordered by most recent year's reported beneficiaries, descending
}

// Molecule merge is GENERAL (group by molecule, not code). This code→molecule map covers
// the multi-code molecules where a name alone can't merge reliably — biosimilars and salt
// variants. It is data, not a special case in the merge logic; bevacizumab is not
// hardcoded in the algorithm, only listed here alongside the others.
const MOLECULE_BY_CODE: Record<string, string> = {
  J9035: "bevacizumab", Q5107: "bevacizumab", Q5118: "bevacizumab", Q5126: "bevacizumab", Q5129: "bevacizumab",
  J9201: "gemcitabine", J9196: "gemcitabine", J9198: "gemcitabine",
  J9305: "pemetrexed", J9304: "pemetrexed",
};

/** Molecule for a code: explicit map first (biosimilar/salt families), else derived from
 *  hcpcs_desc. Reported alongside the diff: derivation is desc-first with an explicit
 *  fallback map for the multi-code families. */
function moleculeFor(code: string, desc: string): string {
  return MOLECULE_BY_CODE[code] ?? deriveMolecule(desc);
}

function deriveMolecule(desc: string): string {
  const s = (desc || "").toLowerCase().replace(/^(injection|infusion|inj\.?),?\s*/, "");
  let agent = (s.split(",")[0] || "").trim();
  agent = agent.replace(/-[a-z]{4}$/, ""); // biosimilar suffix, e.g. bevacizumab-awwb
  agent = agent.replace(/\s+(hydrochloride|hcl|sulfate|sodium.*|acetate.*|phosphate.*|powder.*|not\s+otherwise.*)$/, "").trim();
  return agent || (desc || "").trim();
}

function badgeFor(codes: string[]): AgentBadge | null {
  if (codes.includes("J9305") || codes.includes("J9304")) return "nsclc_anchored"; // pemetrexed
  if (codes.includes("J9173")) return "thoracic_enriched"; // durvalumab
  return null;
}

/** Product label for the per-year multi-product note: parenthetical brand (e.g. "(mvasi)"),
 *  else the biosimilar suffix, else the bare code. */
function productLabel(code: string, desc: string): string {
  const brand = /\(([^)]+)\)/.exec(desc || "");
  if (brand) return brand[1].toLowerCase();
  const suffix = /-([a-z]{4})\b/.exec((desc || "").toLowerCase());
  if (suffix) return suffix[1];
  return code;
}

interface RawCell {
  program_year: number;
  hcpcs_code: string;
  hcpcs_desc: string;
  tot_benes: number | null;
  total_bene_day_services: number | null;
}

export async function loadAdministeredTherapy(hcpId: string): Promise<AdministeredTherapy> {
  const empty: AdministeredTherapy = {
    state: "no_claims", windowYears: [], productCount: 0, agentRowCount: 0, cellCount: 0, maxRecentDays: 0, rows: [],
  };
  // NPI presence decides which absence is true (hcps_v2 is public-read).
  const npiRes = await supabase.from("hcps_v2").select("npi_number").eq("id", hcpId).maybeSingle();
  const npiKnown = !npiRes.error && !!(npiRes.data as { npi_number?: string | null } | null)?.npi_number;
  if (!npiRes.error && !npiKnown) {
    return { ...empty, state: "no_npi" };
  }
  const { data, error } = await supabase.rpc("hcp_administered_therapy", { p_hcp_id: hcpId });
  if (error) {
    console.warn("hcp_administered_therapy failed:", error.message);
    return empty;
  }
  const raw = (data ?? []) as RawCell[];
  if (raw.length === 0) return empty;

  const present = Array.from(new Set(raw.map((r) => r.program_year))).sort((a, b) => a - b);
  const minY = present[0];
  const maxY = present[present.length - 1];
  const windowYears: number[] = [];
  for (let y = minY; y <= maxY; y++) windowYears.push(y);

  type Group = { codes: Set<string>; perYear: Map<number, { benes: number; days: number; products: Set<string> }> };
  const byMol = new Map<string, Group>();
  for (const r of raw) {
    const mol = moleculeFor(r.hcpcs_code, r.hcpcs_desc);
    let g = byMol.get(mol);
    if (!g) { g = { codes: new Set(), perYear: new Map() }; byMol.set(mol, g); }
    g.codes.add(r.hcpcs_code);
    let py = g.perYear.get(r.program_year);
    if (!py) { py = { benes: 0, days: 0, products: new Set() }; g.perYear.set(r.program_year, py); }
    py.benes += r.tot_benes ?? 0;
    py.days += r.total_bene_day_services ?? 0;
    py.products.add(productLabel(r.hcpcs_code, r.hcpcs_desc));
  }

  const rows: AgentRow[] = [];
  for (const [molecule, g] of byMol) {
    const cells: YearCell[] = windowYears.map((year) => {
      const py = g.perYear.get(year);
      return py
        ? { year, benes: py.benes, days: py.days, products: [...py.products].sort() }
        : { year, benes: null, days: null, products: [] }; // under floor
    });
    const recent = cells[cells.length - 1];
    rows.push({
      molecule,
      codes: [...g.codes].sort(),
      multiProduct: g.codes.size > 1,
      badge: badgeFor([...g.codes]),
      cells,
      recentBenes: recent.benes ?? 0,
      recentDays: recent.days ?? 0,
      yearsReported: cells.filter((c) => c.benes != null).length,
    });
  }
  // Ordered by most recent year's reported beneficiaries, descending (deterministic tail).
  rows.sort((a, b) => b.recentBenes - a.recentBenes || b.recentDays - a.recentDays || a.molecule.localeCompare(b.molecule));

  return {
    state: "reported",
    windowYears,
    productCount: new Set(raw.map((r) => r.hcpcs_code)).size,
    agentRowCount: rows.length,
    cellCount: raw.length,
    maxRecentDays: Math.max(1, ...rows.map((r) => r.recentDays)),
    rows,
  };
}
