// Rising surface data layer. Layout authority: docs/design/Rising Surface.dc.html
// One RPC per surface (SECURITY DEFINER, migrations/2026_08_05_rising_profile_rpcs.sql):
//   hcp_rising_profile(p_hcp_id) — NULL when the HCP is not on the rising board.
//   rising_board() — the full 1,583-row board + archetype-by-band mix.

import { supabase } from "./supabase";

export interface RisingCollaborator {
  rank: number;
  hcp_id: string;
  name: string;
  institution: string | null;
  shared_publications: number;
  est_us_rank: number | null;
  est_us_score: number | null;
  est_global_rank: number | null;
  est_global_score: number | null;
  rising_us_rank: number | null;
  rising_global_rank: number | null;
  cohort_class: string | null;
}

export interface RisingProfile {
  hcp: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    preferred_display_name: string | null;
    institution_normalized: string | null;
    country: string | null;
    nppes_practice_state: string | null;
    nppes_practice_city: string | null;
    career_first_pub_year: number | null;
    npi_number: string | null;
  };
  rising: {
    rank: number;
    us_rank: number | null;
    archetype: string | null;
    rising_star_percentile: number | null;
    scientific_momentum_percentile: number | null;
    network_momentum_percentile: number | null;
    scientific_visibility_percentile: number | null;
    network_visibility_percentile: number | null;
    momentum_component: number | null;
    visibility_component: number | null;
  };
  momentum: {
    early_total_pubs: number | null;
    recent_total_pubs: number | null;
    early_senior_pubs: number | null;
    recent_senior_pubs: number | null;
    early_window_start: string | null;
    early_window_end: string | null;
    recent_window_start: string | null;
    recent_window_end: string | null;
    early_start_year: number | null;
    early_end_year: number | null;
    recent_start_year: number | null;
    recent_end_year: number | null;
    early_senior_author_pct: number | null;
    recent_senior_author_pct: number | null;
    citation_velocity_delta: number | null;
    pub_velocity_delta: number | null;
  } | null;
  network: {
    early_collaborator_count: number | null;
    recent_collaborator_count: number | null;
  } | null;
  narrative: {
    narrative_text: string | null;
    generated_at: string | null;
    prompt_version: string | null;
    source_enrichment_run_id: string | null;
  } | null;
  narrative_current: boolean | null;
  established_us: { rank: number; cohort_score: number } | null;
  established_global: { rank: number; cohort_score: number } | null;
  positions: { total: number; first_basis: number; senior_basis: number } | null;
  leadership: { senior_pub_count: number | null; first_pub_count: number | null } | null;
  collaborators: RisingCollaborator[];
  collaborator_rows_10yr: number | null;
  band_total: number | null;
  band_same_archetype: number | null;
}

export interface RisingBoardRow {
  hcp_id: string;
  rank: number;
  us_rank: number | null;
  eu_rank: number | null;
  archetype: string | null;
  pctl: number | null;
  mom: number | null;
  vis: number | null;
  name: string;
  institution: string | null;
  country: string | null;
  state: string | null;
  career_first_pub_year: number | null;
}

export interface RisingBoard {
  rows: RisingBoardRow[];
  band_mix: { band: string; archetype: string | null; n: number }[];
}

export async function getRisingProfile(hcpId: string): Promise<RisingProfile | null> {
  const { data, error } = await supabase.rpc("hcp_rising_profile", { p_hcp_id: hcpId });
  if (error) throw new Error(`hcp_rising_profile failed: ${error.message}`);
  return (data as RisingProfile | null) ?? null;
}

export async function getRisingBoard(): Promise<RisingBoard> {
  const { data, error } = await supabase.rpc("rising_board");
  if (error) throw new Error(`rising_board failed: ${error.message}`);
  return data as RisingBoard;
}

// Fast dispatch check: rising board membership wins the profile route. Reads the
// ranks table directly (already anon-readable — the Landscape quadrant does).
export async function isOnRisingBoard(hcpId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("hcp_rising_star_ranks_v3")
    .select("hcp_id")
    .eq("hcp_id", hcpId)
    .limit(1);
  if (error) return false; // fail open to the existing spine, never block the profile
  return (data ?? []).length > 0;
}

// ── Archetype vocabulary (frame ARCH map) ───────────────────────────────────

// Archetype taxonomy retired 2026-08-05 (the four threshold labels tested as
// chance-rate / residual). Surfaces render quadrant position and the RECENT
// SENIOR AUTHORSHIP event badge via rising_board_flags().
export interface RisingFlags {
  hcp_id: string;
  senior_transition: boolean;
  recent_senior_pubs: number | null;
  first_senior_year: number | null;
  latest_senior_year: number | null;
  on_open_trial: boolean;
}

export async function getRisingFlags(ids: string[]): Promise<Map<string, RisingFlags>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("rising_board_flags", { p_hcp_ids: ids });
  if (error || !data) return new Map();
  return new Map((data as RisingFlags[]).map((f) => [f.hcp_id, f]));
}

export function fmtPctl(v: number | null | undefined): string {
  if (v == null) return "NOT COMPUTED";
  return v.toFixed(2);
}

export function careerYears(firstPubYear: number | null | undefined): number | null {
  if (firstPubYear == null) return null;
  return new Date().getFullYear() - firstPubYear;
}

// Four-state collaborator standing, resolved in spec order:
// ESTABLISHED → ESTABLISHED·GLOBAL → RISING → EARLIER. Never a blank.
export interface CollabStanding {
  state: "ESTABLISHED" | "ESTABLISHED · GLOBAL" | "RISING" | "EARLIER";
  detail: string;
  color: string;
}

export function collabStanding(c: RisingCollaborator): CollabStanding {
  if (c.est_us_rank != null) {
    return {
      state: "ESTABLISHED",
      detail: `${c.est_us_score != null ? Number(c.est_us_score).toFixed(2) : "SCORE ON FILE"} · EST RANK ${c.est_us_rank.toLocaleString("en-US")}`,
      color: "#8fb8a6",
    };
  }
  if (c.est_global_rank != null) {
    return {
      state: "ESTABLISHED · GLOBAL",
      detail: `${c.est_global_score != null ? Number(c.est_global_score).toFixed(2) : "SCORE ON FILE"} · GLOBAL RANK ${c.est_global_rank.toLocaleString("en-US")}`,
      color: "#7f93ad",
    };
  }
  if (c.rising_global_rank != null) {
    return {
      state: "RISING",
      detail: c.rising_us_rank != null
        ? `ON THE RISING BOARD · RANK ${c.rising_us_rank} US`
        : `ON THE RISING BOARD · RANK ${c.rising_global_rank.toLocaleString("en-US")} GLOBAL`,
      color: "#d8a24a",
    };
  }
  const cls = (c.cohort_class ?? "").replace(/_/g, "-").toUpperCase();
  return {
    state: "EARLIER",
    detail: cls ? `${cls} · NO BOARD ROW YET` : "NO BOARD ROW YET · CAREER STAGE, NOT ABSENT SIGNAL",
    color: "#a9a8a3",
  };
}
