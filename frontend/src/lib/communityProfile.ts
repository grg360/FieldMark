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
  hcp: { id: string; name: string; first_name: string | null; last_name: string | null; specialty: string | null; institution: string | null; city: string | null; state: string | null; npi: string | null };
  practice_shape: { patient_volume: number | null; setting: string | null; career_years: number | null; drug_breadth: number | null; total_career_pubs: number | null };
  /** 2026-07-30 re-score signals — separate and traceable, never one blended number.
   *  volume_2023_est is an estimated distinct-patient FLOOR (proxy: drugs cross
   *  indications) — label "NSCLC-relevant therapy", never "NSCLC patients". */
  nsclc: { spend_3yr: number | null; volume_2023_est: number | null; spend_signal: number | null; volume_signal: number | null } | null;
  /** Σ total_paid_est all codes — the real Medicare-paid figure (the summary's
   *  total_medicare_payment_3yr is defective; never display it). */
  medicare_paid_corrected: number | null;
  /** Phase 3 roster: facts only — community is not ranked. */
  standing: { qualifies: boolean | null; evidence_tier: string | null; patient_volume: number | null; part_d_present: boolean | null; recurrence_band: string | null; anchor_stem: string | null; anchor_stems: string[] | null; anchor_years: number[] | null; supported_evidence: string | null; lung_weighted: boolean | null } | null;
  engagement: {
    has_record: boolean;
    distinct_drugs: number | null;
    lifetime_total: number | null;
    distinct_companies: number | null;
    products: Product[] | null;
  };
  mix: { label: string; amount: number | null }[] | null;
  entities: { name: string; amount: number; payments: number; most_recent: string | null; rank: number | null }[] | null;
  timeline: { year: number; total: number | null }[] | null;
  // NULLABLE: the community_hcp_profile RPC returns null here when the HCP has no
  // hcp_narratives_v2 row (narratives are generated for top-ranked HCPs only — ~91% of
  // the community cohort has none). Was typed non-null, which hid an unguarded deref.
  narrative: { why_this: string | null; signal_strength: string | null; why_now: string | null; engagement_angle: string | null; caution: string | null } | null;
}

export async function loadCommunityProfile(hcpId: string): Promise<CommunityProfile | null> {
  const { data, error } = await supabase.rpc("community_hcp_profile", { p_hcp_id: hcpId });
  if (error || !data) {
    console.error("community_hcp_profile failed:", error?.message);
    return null;
  }
  return data as CommunityProfile;
}

// NSCLC evidence tier for a single HCP (hcp_nsclc_evidence_tier_v1). Cheap per-hcp
// lookup (~0.4ms; the hcp_id predicate pushes through the view's aggregates into PK
// indexes). Drives the profile evidence line. Reasoning:
// docs/design/NSCLC_COHORT_EVIDENCE_TIERS.md.
export type EvidenceTierName = "anchored" | "supported" | "candidate" | "heme_dominant" | "unresolved";
export interface NsclcEvidenceTier {
  tier: EvidenceTierName;
  years_anchored: number | null;
  recurrence_band: "recurs" | "single_year" | null;
  anchor_stem: string | null;
  anchor_stems: string[] | null;
  anchor_years: number[] | null;
  supported_evidence: string | null;
  supported_evidence_rank: number | null;
  lung_share: number | null;
  oral_denominator: number | null;
  oral_recent_year: number | null;
  lung_weighted: boolean;
}

export async function loadEvidenceTier(hcpId: string): Promise<NsclcEvidenceTier | null> {
  const { data, error } = await supabase
    .from("hcp_nsclc_evidence_tier_v1")
    .select(
      "tier, years_anchored, recurrence_band, anchor_stem, anchor_stems, anchor_years, " +
        "supported_evidence, supported_evidence_rank, lung_share, oral_denominator, oral_recent_year, lung_weighted",
    )
    .eq("hcp_id", hcpId)
    .maybeSingle();
  if (error) {
    console.warn("loadEvidenceTier: supabase error", error.message);
    return null;
  }
  return (data as NsclcEvidenceTier | null) ?? null;
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

/** Millions-aware variant for the corrected Medicare-paid / therapy-spend figures. */
export function moneyCompact(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return money(v);
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
