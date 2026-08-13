// Institutions surface data layer — registry-first (design frame Institutions.dc.html).
//
// Everything here reads institution_ta_roster_v1: one row per (registry record,
// TA, cohort, ranked HCP), primary link only (ladder + deterministic tie-break
// computed in the view; hcp_institutions_v2 is never written). Slugs remain
// STRING-DERIVED — institutionToSlug over names — the registry supplies
// attributes, never the URL. Old profile links carry slugs of hcps_v2 strings,
// so record resolution tries the registry canonical slug first and falls back
// to resolving the string's carriers to their primary registry record.

import { supabase } from "./supabase";
import { institutionToSlug } from "./institutionUtils";

export type CohortKey = "established" | "rising" | "community";

export interface RosterRow {
  reference_institution_id: string;
  canonical_name: string;
  institution_type: string;
  nci_designation: string | null;
  is_coe: boolean | null;
  primary_state: string | null;
  network_parent: string | null;
  tie_broken: boolean;
  hcp_id: string;
  cohort: CohortKey;
  us_rank: number | null;
  global_rank: number | null;
  index_score: number | null;
  first_name: string | null;
  last_name: string | null;
}

export interface InstitutionAgg {
  id: string;
  name: string;
  slug: string;
  type: string;
  nciDesignation: string | null;
  isCoe: boolean;
  state: string | null;
  networkParent: string | null;
  memberCount: number; // DISTINCT ranked HCPs (an HCP in two cohorts counts once)
  est: number;
  ris: number;
  com: number;
  bestUsRank: number | null; // best US rank held in ANY cohort (each on its own scale)
  usRanks: number[]; // established US ranks first, then rising, then community
  band: "A" | "B" | "C" | "D";
}

const PAGE = 1000;

export async function fetchTaRoster(taId: string): Promise<RosterRow[]> {
  const rows: RosterRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("institution_ta_roster_v1")
      .select(
        "reference_institution_id, canonical_name, institution_type, nci_designation, is_coe, primary_state, network_parent, tie_broken, hcp_id, cohort, us_rank, global_rank, index_score, first_name, last_name",
      )
      .eq("therapeutic_area_id", taId)
      .order("reference_institution_id")
      .order("hcp_id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as RosterRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// Bands are cut on rank THRESHOLDS (holds a top-10, top-50, top-250) so the
// shape survives a refilter — frame design note 01. Best rank is the best a
// place holds in any cohort, each cohort on its own scale.
export function bandFor(bestUsRank: number | null): "A" | "B" | "C" | "D" {
  if (bestUsRank != null && bestUsRank <= 10) return "A";
  if (bestUsRank != null && bestUsRank <= 50) return "B";
  if (bestUsRank != null && bestUsRank <= 250) return "C";
  return "D";
}

export const BAND_LABEL: Record<string, string> = {
  A: "HOLDS A TOP-10 US HCP",
  B: "HOLDS A TOP-50 US HCP",
  C: "HOLDS A TOP-250 US HCP",
  D: "RANKED PRESENCE, NO TOP-250 HCP",
};

export function aggregateInstitutions(rows: RosterRow[]): InstitutionAgg[] {
  const byInst = new Map<string, RosterRow[]>();
  for (const r of rows) {
    const list = byInst.get(r.reference_institution_id);
    if (list) list.push(r);
    else byInst.set(r.reference_institution_id, [r]);
  }
  const out: InstitutionAgg[] = [];
  for (const [id, list] of byInst) {
    const first = list[0];
    const hcps = new Set(list.map((r) => r.hcp_id));
    const cohortSets: Record<CohortKey, Set<string>> = {
      established: new Set(),
      rising: new Set(),
      community: new Set(),
    };
    for (const r of list) cohortSets[r.cohort].add(r.hcp_id);
    const ranksByCohort: Record<CohortKey, number[]> = { established: [], rising: [], community: [] };
    let best: number | null = null;
    for (const r of list) {
      if (r.us_rank != null) {
        ranksByCohort[r.cohort].push(r.us_rank);
        if (best == null || r.us_rank < best) best = r.us_rank;
      }
    }
    for (const k of Object.keys(ranksByCohort) as CohortKey[]) {
      ranksByCohort[k].sort((a, b) => a - b);
    }
    out.push({
      id,
      name: first.canonical_name,
      slug: institutionToSlug(first.canonical_name),
      type: first.institution_type,
      nciDesignation: first.nci_designation,
      isCoe: !!first.is_coe,
      state: first.primary_state,
      networkParent: first.network_parent,
      memberCount: hcps.size,
      est: cohortSets.established.size,
      ris: cohortSets.rising.size,
      com: cohortSets.community.size,
      bestUsRank: best,
      usRanks: [...ranksByCohort.established, ...ranksByCohort.rising, ...ranksByCohort.community],
      band: bandFor(best),
    });
  }
  // Ordered by ranked-HCP count. NOT a ranking of institutions — the order is
  // descriptive; best rank breaks count ties so the order is at least stable.
  out.sort((a, b) => b.memberCount - a.memberCount || (a.bestUsRank ?? 1e9) - (b.bestUsRank ?? 1e9) || a.name.localeCompare(b.name));
  return out;
}

// Record resolution: registry canonical slug first; else treat the slug as a
// legacy hcps_v2 string slug and resolve its carriers' primary registry record.
export function resolveRecordBySlug(aggs: InstitutionAgg[], slug: string): InstitutionAgg | null {
  return aggs.find((a) => a.slug === slug) ?? null;
}

export async function resolveLegacySlugToRecord(
  slug: string,
  aggs: InstitutionAgg[],
): Promise<InstitutionAgg | null> {
  // Legacy string slug (from profile links): find hcps carrying a string that
  // slugs to this value, then map any of them to their primary registry record.
  const fragment = slug.split("-").filter((w) => w.length > 3).slice(0, 2).join("%");
  if (!fragment) return null;
  const { data } = await supabase
    .from("hcps_v2")
    .select("id, institution_normalized, institution_canonical")
    .or(`institution_normalized.ilike.%${fragment}%,institution_canonical.ilike.%${fragment}%`)
    .limit(400);
  if (!data) return null;
  const carrierIds = data
    .filter((r) => {
      const s = (r.institution_normalized as string | null) ?? (r.institution_canonical as string | null);
      return s ? institutionToSlug(s) === slug : false;
    })
    .map((r) => r.id as string);
  if (carrierIds.length === 0) return null;
  const { data: links } = await supabase
    .from("institution_primary_links_v1")
    .select("hcp_id, reference_institution_id")
    .in("hcp_id", carrierIds.slice(0, 100));
  if (!links || links.length === 0) return null;
  const counts = new Map<string, number>();
  for (const l of links) {
    counts.set(l.reference_institution_id as string, (counts.get(l.reference_institution_id as string) ?? 0) + 1);
  }
  const bestId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return aggs.find((a) => a.id === bestId) ?? null;
}

// The unresolved line: ranked HCPs carrying a name string that slugs to this
// record but holding NO registry link. Computed live; rendered only when > 0.
export async function countUnresolvedForRecord(
  record: InstitutionAgg,
  taId: string,
  rosterHcpIds: Set<string>,
): Promise<number> {
  const words = record.name.split(/\s+/).filter((w) => w.length > 3);
  const fragment = words.slice(0, 2).join("%");
  if (!fragment) return 0;
  const { data } = await supabase
    .from("hcps_v2")
    .select("id, institution_normalized, institution_canonical")
    .or(`institution_normalized.ilike.%${fragment}%,institution_canonical.ilike.%${fragment}%`)
    .limit(500);
  if (!data) return 0;
  const slug = record.slug;
  const candidates = data
    .filter((r) => {
      const s = (r.institution_normalized as string | null) ?? (r.institution_canonical as string | null);
      return s ? institutionToSlug(s) === slug : false;
    })
    .map((r) => r.id as string)
    .filter((id) => !rosterHcpIds.has(id));
  if (candidates.length === 0) return 0;
  // Ranked = present on any of the three boards for this TA.
  const ids = candidates.slice(0, 150);
  // Community membership (G2 correction with the ranks-view retirement): for
  // NSCLC the board's qualifies flag is the membership truth — the old ranks
  // view counted every scored HCP, over-counting by the ~8k scored-but-not-
  // qualifying US tail. Other TAs stay ungated on the scores base table.
  const NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d";
  const [est, ris, risAd, com] = await Promise.all([
    supabase.from("hcp_established_ranks_v3").select("hcp_id").eq("therapeutic_area_id", taId).in("hcp_id", ids),
    supabase.from("hcp_rising_star_ranks_v3").select("hcp_id").eq("therapeutic_area_id", taId).in("hcp_id", ids),
    supabase.from("hcp_rising_composite_v1").select("hcp_id").eq("therapeutic_area_id", taId).in("hcp_id", ids),
    taId === NSCLC_TA_ID
      ? supabase.from("community_board_nsclc_v1").select("hcp_id").eq("qualifies", true).in("hcp_id", ids)
      : supabase.from("hcp_community_scores_v2").select("hcp_id").eq("therapeutic_area_id", taId).in("hcp_id", ids),
  ]);
  const ranked = new Set<string>();
  for (const res of [est, ris, risAd, com]) {
    for (const r of res.data ?? []) ranked.add(r.hcp_id as string);
  }
  return ranked.size;
}

// Best-effort geography for the record hero: the registry has no city or
// coordinates; institution_geo_lookup may know the name. Absent stays absent —
// the frame's vocabulary ("NOT ON RECORD") renders the gap as a fact.
export async function fetchRecordGeo(
  name: string,
): Promise<{ city: string | null; lat: number | null; lng: number | null }> {
  const { data } = await supabase
    .from("institution_geo_lookup")
    .select("city, latitude, longitude")
    .ilike("institution_display_name", name)
    .limit(1);
  const row = data?.[0];
  return {
    city: (row?.city as string | null) ?? null,
    lat: (row?.latitude as number | null) ?? null,
    lng: (row?.longitude as number | null) ?? null,
  };
}
