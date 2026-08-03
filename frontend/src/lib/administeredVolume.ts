// Administered Volume block — data layer. Reads the hcp_administered_volume RPC
// (migration 2026_08_03), which enforces the five seam rules and four corrections
// server-side. The component renders this payload; it never recomputes figures
// (the unique-beneficiary estimate in particular stays upstream at practice scale).

import { supabase } from "./supabase";
import { taIdForApiSlug } from "./api";

export interface AVRow {
  code: string;
  agent?: string | null;
  name?: string | null;
  category?: string | null;
  instances_latest: number | null;
  units_latest?: number | null;
  services_latest?: number | null;
  paid_latest: number | null;
  paid_3yr?: number | null;
}
export interface AVPerYear {
  year: number;
  instances: number | null;
  units?: number | null;
  paid: number | null;
}
export interface AdministeredVolume {
  state: "matched" | "sparse" | "no_set_activity" | "no_medicare";
  ledger_lead?: "drug" | "procedure";
  max_year?: number;
  has_practice_scale?: boolean;
  corrected_paid_3yr?: number | null;
  benes_2023?: number | null;
  primary_drug_paid_3yr?: number | null; // NULL = administers no primary agents
  seam?: { pct: number; primary_paid_3yr: number; corrected_paid_3yr: number } | null;
  primary_drug?: {
    codes_admin: number;
    codes_total: number;
    paid_3yr: number | null;
    rows: AVRow[];
    per_year: AVPerYear[];
  };
  secondary?: {
    codes_admin: number;
    codes_total: number;
    paid_3yr: number | null;
    pct_of_corrected: number | null;
    rows: AVRow[];
  };
  procedures?: {
    present: boolean;
    instances_latest: number | null;
    paid_latest: number | null;
    per_year: AVPerYear[];
    rows: AVRow[];
  };
  distinct_codes_in_set?: number;
  set_codes_total?: number;
  drug_services_note?: string;
}

export async function loadAdministeredVolume(
  hcpId: string,
  taSlug: string,
): Promise<AdministeredVolume | null> {
  const taId = taIdForApiSlug(taSlug);
  if (!taId) return null;
  const { data, error } = await supabase.rpc("hcp_administered_volume", {
    p_hcp_id: hcpId,
    p_ta_id: taId,
  });
  if (error || !data) {
    if (error) console.error("hcp_administered_volume failed:", error.message);
    return null;
  }
  return data as AdministeredVolume;
}
