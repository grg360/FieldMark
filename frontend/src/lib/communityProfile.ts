// Community HCP profile (direction 1a "two spines") — stage 1 data layer.
//
// Public/derived sections from the community_hcp_profile RPC (see the migration for the
// table behind each field). Field Insights + relationship controls are per-MSL and come
// from the authenticated client (msl_hcp_notes / context), same as the academic profile.

import { supabase } from "./supabase";

// Trajectory direction is REAL where year_over_year_trend_pct exists; below that, the
// frame's honest empty ("insufficient history"). Thresholds are config, not constants.
export const TRAJECTORY = { growingPct: 25, contractingPct: -25 } as const;
export const MATERIALITY_USD = 1000; // frame: products above the $1,000 disclosure-materiality threshold

export type TrajectoryDir = "growing" | "stable" | "contracting" | "insufficient";
export function trajectory(trendPct: number | null | undefined): TrajectoryDir {
  if (trendPct == null) return "insufficient";
  if (trendPct >= TRAJECTORY.growingPct) return "growing";
  if (trendPct <= TRAJECTORY.contractingPct) return "contracting";
  return "stable";
}

export interface Product {
  drug: string;
  entity: string | null;
  amount: number | null;
  payments: number | null;
  most_recent: string | null;
  trend_pct: number | null;
  py2022: number | null;
  py2023: number | null;
  py2024: number | null;
}

export interface CommunityProfile {
  hcp: { id: string; name: string; first_name: string | null; last_name: string | null; specialty: string | null; city: string | null; state: string | null; npi: string | null };
  practice_shape: { patient_volume: number | null; setting: string | null; career_years: number | null; drug_breadth: number | null; total_career_pubs: number | null };
  score: { composite: number | null; normalized: number | null; rank: number | null; scope_size: number | null; publication_signal: number | null; total_career_pubs: number | null } | null;
  has_score: boolean | null;
  engagement: {
    has_record: boolean;
    distinct_drugs: number | null;
    lifetime_total: number | null;
    distinct_companies: number | null;
    products: Product[] | null;
  };
  mix: { label: string; amount: number | null }[] | null;
  entities: { name: string; amount: number; payments: number }[] | null;
  timeline: { year: number; total: number | null }[] | null;
  narrative: { why_this: string | null; signal_strength: string | null; why_now: string | null; engagement_angle: string | null; caution: string | null };
}

export async function loadCommunityProfile(hcpId: string): Promise<CommunityProfile | null> {
  const { data, error } = await supabase.rpc("community_hcp_profile", { p_hcp_id: hcpId });
  if (error || !data) {
    console.error("community_hcp_profile failed:", error?.message);
    return null;
  }
  return data as CommunityProfile;
}

export async function loadProfileSpine(hcpId: string): Promise<"academic" | "community"> {
  const { data, error } = await supabase.rpc("hcp_profile_spine", { p_hcp_id: hcpId });
  if (error || !data) return "community"; // safe fallback: the spine that renders without publications
  return data === "academic" ? "academic" : "community";
}

export function money(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
