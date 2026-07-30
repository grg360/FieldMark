// HCP Profile redesign (direction 1a "Brief") — stage 1 data layer.
//
// Public/derived sections come from the hcp_profile_brief RPC (one SECURITY DEFINER
// aggregation; see the migration for the table behind each field). Field Presence is
// per-MSL and RLS-scoped, so it is fetched separately by the authenticated client.
//
// Design's render "ladder" thresholds are CONFIG here, not constants scattered through
// the view (Design flagged: "if Code hard-codes them, they should be config"). Each
// section's render vs honest-empty decision is derived from real counts.

import { supabase } from "./supabase";

// The four thresholds Design placed by judgement (positions 1+ is implicit).
export const THRESHOLDS = {
  synthesisMinPositions: 4, // belief synthesis paragraph
  silenceMinSources: 12, // "where the record is silent" compliance guard
  lensMinPositions: 6, // objective lens turns on
  deltaMinObservations: 2, // "what changed" delta card
} as const;

export interface ProfileSource {
  journal: string | null;
  title: string | null;
  pub_year: number | null;
  doi: string | null;
  author_role: string | null;
  citation_count: number | null;
}

export interface ProfilePosition {
  theme: string;
  summary: string;
  evidence_count: number | null;
  paper_count: number | null; // supporting_paper_count — 1 ⇒ SINGLE SOURCE
  confidence: number | null;
  categories: string[] | null;
  sources: ProfileSource[] | null; // real citation rows (distinct papers)
}

export interface ProfileTier {
  key: string;
  label: string;
  positions: ProfilePosition[] | null;
}

export interface RawPosition {
  category: string | null;
  text: string | null;
  excerpt: string | null;
  role: string | null;
  year: number | null;
  citation_count: number | null;
  source: { journal: string | null; title: string | null; year: number | null; doi: string | null } | null;
}

export interface HcpProfile {
  hcp: {
    id: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    institution: string | null;
    city: string | null;
    state: string | null;
    npi: string | null;
    specialty: string | null;
  };
  scores: {
    index: number | null;
    rank: number | null;
    global_rank: number | null;
    sci: number | null;
    net: number | null;
    pharma: number | null;
    vs_cohort_mean: number | null;
    basis_papers: number | null;
    basis_senior: number | null;
  } | null;
  record_depth: { sources: number; papers: number; oldest: number | null; newest: number | null };
  belief: {
    has_synthesis: boolean | null;
    headline: string | null;
    synth_position_count: number | null;
    synth_paper_count: number | null;
    synth_source_count: number | null;
    source_count: number | null;
    paper_count: number | null;
    tiers: ProfileTier[] | null;
    raw_positions: RawPosition[] | null;
  };
  record: {
    publications_total: number | null;
    senior_pub_count: number | null;
    senior_recent_5yr: number | null;
    guideline_count: number | null;
    first_pub_count: number | null;
    timeline: { year: number; count: number }[] | null;
    pharma_companies: { name: string; amount: number; count: number }[] | null;
    engagement_mix: Record<string, number> | null;
  };
  signal_summary: string | null;
}

export interface FieldNote {
  body: string | null;
  occurred_at: string | null;
  created_at: string | null;
  belief_claim_title: string | null;
  insight_category: string | null;
}

export async function loadHcpProfile(hcpId: string): Promise<HcpProfile | null> {
  const { data, error } = await supabase.rpc("hcp_profile_brief", { p_hcp_id: hcpId });
  if (error || !data) {
    console.error("hcp_profile_brief failed:", error?.message);
    return null;
  }
  return data as HcpProfile;
}

/** Field Presence — the current MSL's real notes on this HCP (RLS-scoped, dated). Also
 *  the only section the empty state invites the user to fill. */
export async function loadFieldPresence(hcpId: string): Promise<FieldNote[]> {
  const { data, error } = await supabase
    .from("msl_hcp_notes")
    .select("body, occurred_at, created_at, belief_claim_title, insight_category, msl_hcp_relationships!inner(hcp_id, user_id)")
    .eq("msl_hcp_relationships.hcp_id", hcpId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false });
  if (error) {
    console.warn("loadFieldPresence failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    body: (r.body as string) ?? null,
    occurred_at: (r.occurred_at as string) ?? null,
    created_at: (r.created_at as string) ?? null,
    belief_claim_title: (r.belief_claim_title as string) ?? null,
    insight_category: (r.insight_category as string) ?? null,
  }));
}

// ── Derived helpers (pure) ───────────────────────────────────────────────────

/** How many belief positions this HCP has, for the ladder thresholds. Synthesized tiers
 *  when present, else raw positions. */
export function positionCount(p: HcpProfile): number {
  if (p.belief.has_synthesis && p.belief.synth_position_count) return p.belief.synth_position_count;
  return p.belief.raw_positions?.length ?? 0;
}

/** Sourced positions = distinct papers behind the record. Drives the silence guard. */
export function sourceCount(p: HcpProfile): number {
  return p.record_depth.sources ?? 0;
}

export function renderSynthesis(p: HcpProfile): boolean {
  return !!p.belief.headline && positionCount(p) >= THRESHOLDS.synthesisMinPositions;
}
export function renderSilence(p: HcpProfile): boolean {
  return sourceCount(p) >= THRESHOLDS.silenceMinSources;
}
export function lensOn(p: HcpProfile): boolean {
  return positionCount(p) >= THRESHOLDS.lensMinPositions;
}

export function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`;
}

const ROLE_LABEL: Record<string, string> = {
  first_author: "FIRST",
  senior_author: "SENIOR",
  middle_author: "CO-AUTHOR",
  co_author: "CO-AUTHOR",
};
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABEL[role] ?? role.replace(/_/g, " ").toUpperCase();
}

/** Short journal label — the frame renders "NEJM 2024 SENIOR" style. */
export function journalShort(journal: string | null | undefined): string {
  if (!journal) return "—";
  const j = journal.toLowerCase();
  if (j.includes("new england")) return "NEJM";
  if (j.includes("lancet oncol")) return "LANCET ONCOL";
  if (j.includes("lancet")) return "LANCET";
  if (j.includes("clinical oncology") || j.includes("j clin oncol")) return "J CLIN ONCOL";
  if (j.includes("nature medicine")) return "NAT MED";
  if (j.includes("nature review")) return "NAT REV";
  if (j.includes("nature")) return "NATURE";
  if (j.includes("cancer cell")) return "CANCER CELL";
  if (j.includes("cancer discov")) return "CANCER DISCOV";
  if (j.includes("annals of oncology") || j.includes("ann oncol")) return "ANN ONCOL";
  return journal.replace(/\s*\([^)]*\)\s*/g, "").toUpperCase().slice(0, 22);
}
