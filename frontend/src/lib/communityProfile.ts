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

// Community evidence tier for a single HCP, IN ONE TA. Cheap per-hcp lookup (~0.4ms; the
// hcp_id predicate pushes through the view's aggregates into PK indexes). Drives the profile
// evidence line. Reasoning: docs/design/NSCLC_COHORT_EVIDENCE_TIERS.md.
//
// TA-SCOPED SINCE 2026-09-17, AND THAT IS A DEFECT FIX, NOT A REFACTOR. This read went
// straight at hcp_nsclc_evidence_tier_v1 — the LUNG-ONLY view — with an hcp_id predicate and
// no TA at all, while ProfileDispatch routes every community HCP of every TA to the profile
// that consumes it. Measured against the 330 anchored colorectal HCPs on the day of the fix:
// 214 had no row in that view and silently rendered no evidence line, and the other 116 had
// their LUNG tier rendered on a colorectal profile — 54 of them reading "anchored" with lung
// stems and lung years, 48 reading "no NSCLC-specific drug evidence", 3 "heme-dominant". That
// is another TA's evidence presented as this one's, which is worse than the missing line.
//
// hcp_evidence_tier_v1 is the TA-neutral union (nsclc_v1 / partd_presence_v1 /
// partb_practice_v1 arms, keyed ta_id + hcp_id) and is granted to anon and authenticated.
// Its non-nsclc arms select anchor_stem, anchor_stems, anchor_years, supported_evidence,
// lung_share, oral_denominator, oral_recent_year and lung_weighted as NULL by construction —
// so a caller must describe the tier from its MODEL, never from those fields. See
// COM_EVIDENCE_MODELS in lib/cohortLedger.ts.
//
// taId IS REQUIRED. useProfileTa returns null while resolving, and a null there must gate
// this read rather than widen it — an unscoped query is exactly the defect above.
export type EvidenceTierName = "anchored" | "supported" | "candidate" | "heme_dominant" | "unresolved";
export interface CommunityEvidenceTier {
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

export async function loadEvidenceTier(hcpId: string, taId: string): Promise<CommunityEvidenceTier | null> {
  const { data, error } = await supabase
    .from("hcp_evidence_tier_v1")
    .select(
      "tier, years_anchored, recurrence_band, anchor_stem, anchor_stems, anchor_years, " +
        "supported_evidence, supported_evidence_rank, lung_share, oral_denominator, oral_recent_year, lung_weighted",
    )
    .eq("hcp_id", hcpId)
    .eq("ta_id", taId)
    .maybeSingle();
  if (error) {
    console.warn("loadEvidenceTier: supabase error", error.message);
    return null;
  }
  return (data as CommunityEvidenceTier | null) ?? null;
}

export async function loadProfileSpine(hcpId: string, taId: string): Promise<"academic" | "community"> {
  const { data, error } = await supabase.rpc("hcp_profile_spine_ta", { p_hcp_id: hcpId, p_ta_id: taId });
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
