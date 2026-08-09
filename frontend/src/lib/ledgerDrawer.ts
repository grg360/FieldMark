// Ledger drawer layers (frame: Ledger Drawer.dc.html, project 022f071a).
// Three layers per open row, each computed for the subject AND both adjacent
// ranks (the uniform neighbour rule): the score spine comes from row data
// already loaded; this lib fetches the other two:
//   PRACTICE — hcp_canonical_topic_share_v1 (per-HCP canonical-class shares;
//              "n of m labeled publications", never a pie; low-corpus floor
//              on total_labeled_pubs)
//   BELIEF   — hcp_scientific_positions_v1 (extracted positions; enrichment,
//              8% of Established / 80% of Rising — absence is the norm and is
//              stated as "empty, not contradicted")
// Both tables anon-readable (verified 2026-08-08). One batched fetch per
// drawer open (subject + up to 2 neighbours).
import { supabase } from "./supabase";

export interface TopicClass {
  name: string;
  labeled: number;
  primary: number;
  share: number;
}

export interface DrawerLayerData {
  topicTotal: number; // total_labeled_pubs (0 = nothing labeled)
  topicClasses: TopicClass[]; // all classes, share-desc
  beliefCount: number;
  beliefTexts: string[]; // up to 3 position texts, confidence-desc (subject only needs these)
}

// The practice rules, in one place (the frame's three modes):
//   low  — total_labeled_pubs < FLOOR: focus is not asserted
//   span — no class clears DOMINANT_SHARE: spans classes, no dominant focus
//   dom  — 1–2 classes at/above DOMINANT_SHARE, named literally
export const PRACTICE_FLOOR = 12;
export const DOMINANT_SHARE = 0.15;

export function dominantClasses(d: DrawerLayerData): TopicClass[] {
  if (d.topicTotal < PRACTICE_FLOOR) return [];
  return d.topicClasses.filter((c) => c.share >= DOMINANT_SHARE).slice(0, 2);
}

export async function getDrawerLayerData(
  hcpIds: string[],
  taId: string,
): Promise<Map<string, DrawerLayerData>> {
  const out = new Map<string, DrawerLayerData>();
  for (const id of hcpIds) {
    out.set(id, { topicTotal: 0, topicClasses: [], beliefCount: 0, beliefTexts: [] });
  }
  if (hcpIds.length === 0) return out;

  const [topicRes, beliefRes] = await Promise.all([
    supabase
      .from("hcp_canonical_topic_share_v1")
      .select("hcp_id, canonical_name, labeled_pubs_in_class, primary_pubs_in_class, total_labeled_pubs, share")
      .in("hcp_id", hcpIds)
      .eq("therapeutic_area_id", taId),
    supabase
      .from("hcp_scientific_positions_v1")
      .select("hcp_id, position_text, confidence")
      .in("hcp_id", hcpIds)
      .eq("therapeutic_area_id", taId)
      .order("confidence", { ascending: false }),
  ]);
  if (topicRes.error) console.warn("getDrawerLayerData: topics", topicRes.error);
  if (beliefRes.error) console.warn("getDrawerLayerData: beliefs", beliefRes.error);

  for (const r of (topicRes.data ?? []) as Array<Record<string, unknown>>) {
    const d = out.get(String(r.hcp_id));
    if (!d) continue;
    d.topicTotal = Number(r.total_labeled_pubs ?? 0);
    d.topicClasses.push({
      name: String(r.canonical_name ?? ""),
      labeled: Number(r.labeled_pubs_in_class ?? 0),
      primary: Number(r.primary_pubs_in_class ?? 0),
      share: Number(r.share ?? 0),
    });
  }
  for (const d of out.values()) d.topicClasses.sort((a, b) => b.share - a.share);

  for (const r of (beliefRes.data ?? []) as Array<Record<string, unknown>>) {
    const d = out.get(String(r.hcp_id));
    if (!d) continue;
    d.beliefCount += 1;
    if (d.beliefTexts.length < 3 && r.position_text) d.beliefTexts.push(String(r.position_text));
  }
  return out;
}
