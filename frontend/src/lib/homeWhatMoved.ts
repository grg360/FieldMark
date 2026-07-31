// Home — WHAT MOVED. The redesigned Home surface leads with index MOVEMENT.
//
// DATA RULE (binding, from the audit + sourcing correction): movement is the 2026-06-08 rows
// in hcp_rising_star_snapshots compared against current hcp_rising_star_ranks_v3, scoped to
// US-ranked HCPs (us_rank IS NOT NULL on both sides). Movement is the rising_star_percentile
// delta (current minus snapshot); us_rank deltas are NOT computed or ranked on — cohort
// attrition between snapshots mechanically inflates rank climbs, so us_rank renders as current
// POSITION only. NO other window is computed or implied — the surface renders "compared against
// 8 Jun 2026" explicitly. Both tables are public-read for the anon client (RLS policy on the
// snapshot table mirrors ranks_v3).

import { supabase } from "./supabase";

export const WHAT_MOVED_SNAPSHOT_DATE = "2026-06-08";

export interface Mover {
  hcpId: string;
  name: string;
  institution: string | null;
  state: string | null;
  nowRank: number;       // current us_rank — position only; never render a rank delta
  idxNow: number;        // current rising_star_percentile
  idxWas: number;        // 8-Jun rising_star_percentile
  idxDelta: number;      // idxNow - idxWas (positive = rose)
  sciMomentum: number | null;
  netMomentum: number | null;
  sciVisibility: number | null;
  netVisibility: number | null;
  inTerritory: boolean;
  tracked: boolean;
}

export interface WhatMoved {
  comparedAgainst: string; // always "2026-06-08"
  bandA: Mover | null;     // primary — top index riser, in-territory + untracked when available
  bandB: Mover[];          // up to 2 secondary movers
}

interface CurRow { hcp_id: string; us_rank: number; rising_star_percentile: number | null; scientific_momentum_percentile: number | null; network_momentum_percentile: number | null; scientific_visibility_percentile: number | null; network_visibility_percentile: number | null }
interface SnapRow { hcp_id: string; us_rank: number; rising_star_percentile: number | null }

/**
 * Compute WHAT MOVED live. `territoryStates` (2-letter, upper) scopes band selection to the
 * user's territory; `trackedIds` marks which movers the user already tracks (band A prefers
 * an UNTRACKED in-territory riser, per the frame). Nothing is fabricated: if a value is not
 * on the row it renders as null and the caller omits it.
 */
export async function getWhatMoved(
  territoryStates: string[],
  trackedIds: Set<string>,
): Promise<WhatMoved> {
  const terr = new Set((territoryStates ?? []).map((s) => s.toUpperCase()));

  const [curRes, snapRes] = await Promise.all([
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, us_rank, rising_star_percentile, scientific_momentum_percentile, network_momentum_percentile, scientific_visibility_percentile, network_visibility_percentile")
      .not("us_rank", "is", null),
    supabase
      .from("hcp_rising_star_snapshots")
      .select("hcp_id, us_rank, rising_star_percentile")
      .eq("snapshot_date", WHAT_MOVED_SNAPSHOT_DATE)
      .not("us_rank", "is", null),
  ]);

  const empty: WhatMoved = { comparedAgainst: WHAT_MOVED_SNAPSHOT_DATE, bandA: null, bandB: [] };
  if (curRes.error || snapRes.error) {
    console.warn("getWhatMoved: query error", curRes.error ?? snapRes.error);
    return empty;
  }
  const cur = (curRes.data ?? []) as CurRow[];
  const snap = (snapRes.data ?? []) as SnapRow[];
  const snapById = new Map(snap.map((s) => [s.hcp_id, s]));

  // risers only (index up since 8 Jun) drive the featured bands, largest delta first.
  const risers = cur
    .filter((c) => snapById.has(c.hcp_id))
    .map((c) => {
      const s = snapById.get(c.hcp_id)!;
      return { c, s, idxDelta: (c.rising_star_percentile ?? NaN) - (s.rising_star_percentile ?? NaN) };
    })
    .filter((x) => Number.isFinite(x.idxDelta) && x.idxDelta > 0)
    .sort((a, b) => b.idxDelta - a.idxDelta || a.c.us_rank - b.c.us_rank);

  if (risers.length === 0) return empty;

  // hydrate names / institution / state for the risers we might feature (top ~30 is plenty).
  const ids = risers.slice(0, 30).map((x) => x.c.hcp_id);
  const { data: hcps } = await supabase
    .from("hcps_v2")
    .select("id, first_name, last_name, institution_normalized, nppes_practice_state")
    .in("id", ids);
  const hcpById = new Map((hcps ?? []).map((h) => [h.id as string, h]));

  const movers: Mover[] = risers.slice(0, 30).map((x) => {
    const h = hcpById.get(x.c.hcp_id);
    const state = (h?.nppes_practice_state as string | null) ?? null;
    const name = h ? `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() : "";
    return {
      hcpId: x.c.hcp_id,
      name,
      institution: (h?.institution_normalized as string | null) ?? null,
      state,
      nowRank: x.c.us_rank,
      idxNow: x.c.rising_star_percentile!,
      idxWas: x.s.rising_star_percentile!,
      idxDelta: x.idxDelta,
      sciMomentum: x.c.scientific_momentum_percentile,
      netMomentum: x.c.network_momentum_percentile,
      sciVisibility: x.c.scientific_visibility_percentile,
      netVisibility: x.c.network_visibility_percentile,
      inTerritory: state != null && terr.size > 0 && terr.has(state.toUpperCase()),
      tracked: trackedIds.has(x.c.hcp_id),
    };
  }).filter((m) => m.name);

  // Band A: prefer an in-territory, untracked riser; then in-territory; then overall top.
  const bandA =
    movers.find((m) => m.inTerritory && !m.tracked) ??
    movers.find((m) => m.inTerritory) ??
    movers[0] ??
    null;

  // Band B: next movers, preferring the same territory scope as A, excluding A.
  const rest = movers.filter((m) => m.hcpId !== bandA?.hcpId);
  const bandB = (terr.size > 0 ? rest.filter((m) => m.inTerritory) : rest).slice(0, 2);
  const bandBFinal = bandB.length > 0 ? bandB : rest.slice(0, 2);

  return { comparedAgainst: WHAT_MOVED_SNAPSHOT_DATE, bandA, bandB: bandBFinal };
}
