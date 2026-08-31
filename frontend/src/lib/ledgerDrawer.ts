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

// Request cache (2026-08-09): the query pair measures ~330-560ms round-trip
// from a real client, and the drawer opens in 420ms — fetched on mount, values
// landed mid-animation as a visible second beat. The ledger now PREFETCHES on
// row hover (≥120ms dwell), and this cache lets the hover fetch and the
// mount fetch share one in-flight promise, so a hovered row usually opens with
// data already in hand. Data is stable within a scoring run, so hits never
// revalidate; failed pairs are evicted rather than cached empty.
const layerCache = new Map<string, Promise<Map<string, DrawerLayerData>>>();

export function getDrawerLayerData(
  hcpIds: string[],
  taId: string,
): Promise<Map<string, DrawerLayerData>> {
  const key = `${taId}:${[...hcpIds].sort().join(",")}`;
  const hit = layerCache.get(key);
  if (hit) return hit;
  if (layerCache.size > 300) layerCache.clear(); // bound a long scanning session
  const p = fetchDrawerLayerData(hcpIds, taId, () => layerCache.delete(key));
  layerCache.set(key, p);
  return p;
}

/**
 * Does this TA have ANY labelled corpus? One cached HEAD count per TA.
 *
 * NOT a TA resolution — the TA is already decided by the board and arrives as an argument.
 * This answers a data question the drawer cannot otherwise distinguish: an HCP with zero
 * labelled publications reads identically whether THEY are thinly labelled or whether the
 * labelling pass has never run for their area. Those are different facts and the drawer says
 * different things about them, so it has to know which one it is looking at.
 *
 * Measured 2026-08-31: publication_theme_v1 holds 64,155 nsclc rows and zero for any other TA,
 * while theme_canonical_v1 already carries 25 colorectal-cancer canonical themes. The taxonomy
 * is seeded; scripts/label_pub_themes.py has not been run for it.
 */
const labeledCorpusCache = new Map<string, Promise<boolean>>();

export function taHasLabeledCorpus(taId: string): Promise<boolean> {
  const hit = labeledCorpusCache.get(taId);
  if (hit) return hit;
  const p = (async () => {
    const { count, error } = await supabase
      .from("hcp_canonical_topic_share_v1")
      .select("hcp_id", { count: "exact", head: true })
      .eq("therapeutic_area_id", taId)
      .limit(1);
    if (error) {
      labeledCorpusCache.delete(taId);
      // Fail toward the EXISTING message. An unknown corpus state must not let the drawer
      // announce that a labelling pass has not run when it may well have.
      return true;
    }
    return (count ?? 0) > 0;
  })();
  labeledCorpusCache.set(taId, p);
  return p;
}

/** Fire-and-forget hover prefetch — same cache, same promise as the mount fetch. */
export function prefetchDrawerLayerData(hcpIds: string[], taId: string): void {
  void getDrawerLayerData(hcpIds, taId);
}

async function fetchDrawerLayerData(
  hcpIds: string[],
  taId: string,
  onError: () => void,
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
  if (topicRes.error || beliefRes.error) onError(); // don't cache a failed pair

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
