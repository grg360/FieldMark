import { supabase } from "./supabase";

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_default: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
}

export interface WatchlistItem {
  watchlist_id: string;
  relationship_id: string;
  added_at: string;
  pinned: boolean;
  list_note: string | null;
  sort_order: number;
}

export interface TrackedHcpRow {
  relationship_id: string;
  hcp_id: string;
  name: string;
  institution: string | null;
  state: string | null;
  cohort: string | null;
  cohort_rank: number | null;
  archetype: string | null;
  status: string;
  insight_count: number;
  open_follow_up_count: number;
  overdue_follow_up_count: number;
  last_activity_at: string | null;
  created_at: string;
}

export type TrackedSortField = "name" | "status" | "last_activity" | "cohort" | "insight_count";
export type TrackedSortDirection = "asc" | "desc";
export type TrackedStatusFilter = "all" | "active" | "paused";
export type TrackedCohortFilter = "all" | "rising_star" | "established" | "community";

export interface TrackedHcpQueryParams {
  sortField?: TrackedSortField;
  sortDirection?: TrackedSortDirection;
  statusFilter?: TrackedStatusFilter;
  cohortFilter?: TrackedCohortFilter;
  watchlistId?: string;
}

type HcpDataRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  institution_canonical: string | null;
  institution_normalized: string | null;
  nppes_practice_state: string | null;
  cohort_classification: string | null;
};

export async function getWatchlistsForUser(userId: string): Promise<Watchlist[]> {
  try {
    const { data, error } = await supabase
      .from("msl_watchlists")
      .select("*")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("getWatchlistsForUser: supabase error", error);
      throw error;
    }

    const watchlists = (data ?? []) as Watchlist[];

    const watchlistIds = watchlists.map((w) => w.id);
    if (watchlistIds.length === 0) return [];

    const { data: countData, error: countError } = await supabase
      .from("msl_watchlist_items")
      .select("watchlist_id")
      .in("watchlist_id", watchlistIds);

    if (countError) {
      console.warn("getWatchlistsForUser: count error", countError);
    }

    const countMap = new Map<string, number>();
    for (const row of countData ?? []) {
      const wid = (row as { watchlist_id: string }).watchlist_id;
      countMap.set(wid, (countMap.get(wid) ?? 0) + 1);
    }

    return watchlists.map((w) => ({ ...w, item_count: countMap.get(w.id) ?? 0 }));
  } catch (err) {
    console.warn("getWatchlistsForUser: error", err);
    throw err;
  }
}

export async function createWatchlist(
  userId: string,
  name: string,
  description: string | null = null,
  color: string | null = null,
): Promise<Watchlist> {
  try {
    const { data: existing } = await supabase
      .from("msl_watchlists")
      .select("sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existing && existing.length > 0 ? (existing[0] as { sort_order: number }).sort_order + 1 : 0;

    const { data, error } = await supabase
      .from("msl_watchlists")
      .insert({
        user_id: userId,
        name: name.trim(),
        description: description?.trim() || null,
        color,
        is_default: false,
        sort_order: nextSortOrder,
      })
      .select("*")
      .single();

    if (error) {
      console.warn("createWatchlist: supabase error", error);
      throw error;
    }

    return { ...(data as Watchlist), item_count: 0 };
  } catch (err) {
    console.warn("createWatchlist: error", err);
    throw err;
  }
}

export async function renameWatchlist(
  userId: string,
  watchlistId: string,
  name: string,
  description: string | null,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("msl_watchlists")
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", watchlistId)
      .eq("user_id", userId);

    if (error) {
      console.warn("renameWatchlist: supabase error", error);
      throw error;
    }
  } catch (err) {
    console.warn("renameWatchlist: error", err);
    throw err;
  }
}

export async function archiveWatchlist(userId: string, watchlistId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("msl_watchlists")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", watchlistId)
      .eq("user_id", userId);

    if (error) {
      console.warn("archiveWatchlist: supabase error", error);
      throw error;
    }
  } catch (err) {
    console.warn("archiveWatchlist: error", err);
    throw err;
  }
}

export async function addHcpToWatchlist(
  userId: string,
  watchlistId: string,
  relationshipId: string,
): Promise<void> {
  try {
    const { data: ownerCheck } = await supabase
      .from("msl_watchlists")
      .select("id")
      .eq("id", watchlistId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!ownerCheck) {
      throw new Error("Watchlist not found or not owned by user");
    }

    const { error } = await supabase.from("msl_watchlist_items").upsert(
      {
        watchlist_id: watchlistId,
        relationship_id: relationshipId,
        pinned: false,
        sort_order: 0,
      },
      { onConflict: "watchlist_id,relationship_id", ignoreDuplicates: true },
    );

    if (error) {
      console.warn("addHcpToWatchlist: supabase error", error);
      throw error;
    }
  } catch (err) {
    console.warn("addHcpToWatchlist: error", err);
    throw err;
  }
}

export async function removeHcpFromWatchlist(
  userId: string,
  watchlistId: string,
  relationshipId: string,
): Promise<void> {
  try {
    const { data: ownerCheck } = await supabase
      .from("msl_watchlists")
      .select("id")
      .eq("id", watchlistId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!ownerCheck) {
      throw new Error("Watchlist not found or not owned by user");
    }

    const { error } = await supabase
      .from("msl_watchlist_items")
      .delete()
      .eq("watchlist_id", watchlistId)
      .eq("relationship_id", relationshipId);

    if (error) {
      console.warn("removeHcpFromWatchlist: supabase error", error);
      throw error;
    }
  } catch (err) {
    console.warn("removeHcpFromWatchlist: error", err);
    throw err;
  }
}

export async function getWatchlistMembershipsForRelationship(
  userId: string,
  relationshipId: string,
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("msl_watchlist_items")
      .select("watchlist_id, msl_watchlists!inner(user_id, archived_at)")
      .eq("relationship_id", relationshipId)
      .eq("msl_watchlists.user_id", userId)
      .is("msl_watchlists.archived_at", null);

    if (error) {
      console.warn("getWatchlistMembershipsForRelationship: supabase error", error);
      throw error;
    }

    return new Set((data ?? []).map((row) => (row as { watchlist_id: string }).watchlist_id));
  } catch (err) {
    console.warn("getWatchlistMembershipsForRelationship: error", err);
    throw err;
  }
}

/** The set of hcp_ids that are members of AT LEAST ONE of the user's non-archived
 *  watchlists — the product's "All Tracked · across watchlists" definition. This is the
 *  single source of truth every bookmark/track control reads from (HCPCard, DetailScreen,
 *  the cohort ledger, the two-spine profile). Distinct from "has a relationship row",
 *  which is true for any HCP the user has ever touched (status, note, follow-up). */
export async function getTrackedHcpIds(userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("msl_watchlist_items")
      .select("msl_hcp_relationships!inner(hcp_id, user_id), msl_watchlists!inner(user_id, archived_at)")
      .eq("msl_hcp_relationships.user_id", userId)
      .eq("msl_watchlists.user_id", userId)
      .is("msl_watchlists.archived_at", null);
    if (error) {
      console.warn("getTrackedHcpIds: supabase error", error);
      return new Set();
    }
    const out = new Set<string>();
    for (const row of data ?? []) {
      const rel = (row as { msl_hcp_relationships: unknown }).msl_hcp_relationships;
      const hcpId = Array.isArray(rel) ? (rel[0] as { hcp_id?: string })?.hcp_id : (rel as { hcp_id?: string })?.hcp_id;
      if (hcpId) out.add(hcpId);
    }
    return out;
  } catch (err) {
    console.warn("getTrackedHcpIds: error", err);
    return new Set();
  }
}

export async function getTrackedHcpsForUser(
  userId: string,
  params: TrackedHcpQueryParams = {},
): Promise<TrackedHcpRow[]> {
  const {
    sortField = "name",
    sortDirection = "asc",
    statusFilter = "all",
    cohortFilter = "all",
    watchlistId,
  } = params;

  try {
    let relationships: Array<{
      id: string;
      hcp_id: string;
      status: string;
      first_added_at: string;
      last_interaction_at: string | null;
    }> = [];

    if (watchlistId) {
      const { data, error } = await supabase
        .from("msl_watchlist_items")
        .select(
          "relationship_id, msl_hcp_relationships!inner(id, hcp_id, status, first_added_at, last_interaction_at, user_id)",
        )
        .eq("watchlist_id", watchlistId)
        .eq("msl_hcp_relationships.user_id", userId);

      if (error) {
        console.warn("getTrackedHcpsForUser: watchlist scope error", error);
        throw error;
      }

      relationships = (data ?? []).map((row) => {
        const r = row as { msl_hcp_relationships: unknown };
        const rel = Array.isArray(r.msl_hcp_relationships)
          ? r.msl_hcp_relationships[0]
          : r.msl_hcp_relationships;
        return rel as {
          id: string;
          hcp_id: string;
          status: string;
          first_added_at: string;
          last_interaction_at: string | null;
        };
      });
    } else {
      const { data, error } = await supabase
        .from("msl_hcp_relationships")
        .select("id, hcp_id, status, first_added_at, last_interaction_at")
        .eq("user_id", userId);

      if (error) {
        console.warn("getTrackedHcpsForUser: relationships error", error);
        throw error;
      }

      relationships = (data ?? []) as typeof relationships;
    }

    if (statusFilter !== "all") {
      const targetStatus = statusFilter === "active" ? "active_relationship" : "paused";
      relationships = relationships.filter((r) => r.status === targetStatus);
    }

    if (relationships.length === 0) return [];

    const hcpIds = relationships.map((r) => r.hcp_id);
    const relationshipIds = relationships.map((r) => r.id);

    const CHUNK_SIZE = 100;
    const hcpDataMap = new Map<string, HcpDataRow>();

    for (let i = 0; i < hcpIds.length; i += CHUNK_SIZE) {
      const chunk = hcpIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("hcps_v2")
        .select(
          "id, first_name, last_name, institution_canonical, institution_normalized, nppes_practice_state, cohort_classification",
        )
        .in("id", chunk);

      if (error) {
        console.warn("getTrackedHcpsForUser: hcps chunk error", error);
        continue;
      }

      for (const row of data ?? []) {
        const r = row as HcpDataRow;
        hcpDataMap.set(r.id, r);
      }
    }

    if (cohortFilter !== "all") {
      relationships = relationships.filter((r) => {
        const hcp = hcpDataMap.get(r.hcp_id);
        return hcp?.cohort_classification === cohortFilter;
      });
    }

    if (relationships.length === 0) return [];

    const risingStarHcpIds = relationships
      .filter((r) => hcpDataMap.get(r.hcp_id)?.cohort_classification === "rising_star")
      .map((r) => r.hcp_id);

    const rankMap = new Map<string, { rank: number; archetype: string | null }>();

    if (risingStarHcpIds.length > 0) {
      for (let i = 0; i < risingStarHcpIds.length; i += CHUNK_SIZE) {
        const chunk = risingStarHcpIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from("hcp_rising_star_ranks_v3")
          .select("hcp_id, us_rank, archetype")
          .in("hcp_id", chunk)
          .not("us_rank", "is", null);

        if (error) {
          console.warn("getTrackedHcpsForUser: rank chunk error", error);
          continue;
        }

        for (const row of data ?? []) {
          const r = row as { hcp_id: string; us_rank: number; archetype: string | null };
          const existing = rankMap.get(r.hcp_id);
          if (!existing || r.us_rank < existing.rank) {
            rankMap.set(r.hcp_id, { rank: r.us_rank, archetype: r.archetype });
          }
        }
      }
    }

    const insightCountMap = new Map<string, number>();
    const lastInsightMap = new Map<string, string>();

    for (let i = 0; i < relationshipIds.length; i += CHUNK_SIZE) {
      const chunk = relationshipIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("msl_hcp_notes")
        .select("relationship_id, occurred_at")
        .in("relationship_id", chunk)
        .is("deleted_at", null);

      if (error) {
        console.warn("getTrackedHcpsForUser: insights chunk error", error);
        continue;
      }

      for (const row of data ?? []) {
        const r = row as { relationship_id: string; occurred_at: string };
        insightCountMap.set(r.relationship_id, (insightCountMap.get(r.relationship_id) ?? 0) + 1);
        const currentLast = lastInsightMap.get(r.relationship_id);
        if (!currentLast || r.occurred_at > currentLast) {
          lastInsightMap.set(r.relationship_id, r.occurred_at);
        }
      }
    }

    const openFollowUpMap = new Map<string, number>();
    const overdueFollowUpMap = new Map<string, number>();
    const now = Date.now();

    for (let i = 0; i < relationshipIds.length; i += CHUNK_SIZE) {
      const chunk = relationshipIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("msl_hcp_next_actions")
        .select("relationship_id, due_at, completed_at")
        .in("relationship_id", chunk)
        .is("deleted_at", null)
        .is("completed_at", null);

      if (error) {
        console.warn("getTrackedHcpsForUser: followups chunk error", error);
        continue;
      }

      for (const row of data ?? []) {
        const r = row as { relationship_id: string; due_at: string | null };
        openFollowUpMap.set(r.relationship_id, (openFollowUpMap.get(r.relationship_id) ?? 0) + 1);
        if (r.due_at && new Date(r.due_at).getTime() < now) {
          overdueFollowUpMap.set(
            r.relationship_id,
            (overdueFollowUpMap.get(r.relationship_id) ?? 0) + 1,
          );
        }
      }
    }

    const rows: TrackedHcpRow[] = relationships.map((rel) => {
      const hcp = hcpDataMap.get(rel.hcp_id);
      const rank = rankMap.get(rel.hcp_id);
      const lastInsight = lastInsightMap.get(rel.id);
      const candidates: number[] = [];
      if (rel.last_interaction_at) candidates.push(new Date(rel.last_interaction_at).getTime());
      if (lastInsight) candidates.push(new Date(lastInsight).getTime());
      candidates.push(new Date(rel.first_added_at).getTime());
      const lastActivityTs = Math.max(...candidates);
      const lastActivity = new Date(lastActivityTs).toISOString();

      const name = hcp
        ? `${hcp.first_name ?? ""} ${hcp.last_name ?? ""}`.trim() || "Unknown"
        : "Unknown";

      return {
        relationship_id: rel.id,
        hcp_id: rel.hcp_id,
        name,
        institution: hcp?.institution_canonical ?? hcp?.institution_normalized ?? null,
        state: hcp?.nppes_practice_state ?? null,
        cohort: hcp?.cohort_classification ?? null,
        cohort_rank: rank?.rank ?? null,
        archetype: rank?.archetype ?? null,
        status: rel.status,
        insight_count: insightCountMap.get(rel.id) ?? 0,
        open_follow_up_count: openFollowUpMap.get(rel.id) ?? 0,
        overdue_follow_up_count: overdueFollowUpMap.get(rel.id) ?? 0,
        last_activity_at: lastActivity,
        created_at: rel.first_added_at,
      };
    });

    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortField) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "last_activity": {
          const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return (aTime - bTime) * dir;
        }
        case "cohort": {
          const cohortRank: Record<string, number> = { rising_star: 0, established: 1, community: 2 };
          const aRank = cohortRank[a.cohort ?? ""] ?? 99;
          const bRank = cohortRank[b.cohort ?? ""] ?? 99;
          return (aRank - bRank) * dir;
        }
        case "insight_count":
          return (a.insight_count - b.insight_count) * dir;
        default:
          return 0;
      }
    });

    return rows;
  } catch (err) {
    console.warn("getTrackedHcpsForUser: error", err);
    throw err;
  }
}
