import { supabase } from "./supabase";

export type RelationshipStatus =
  | "not_engaged"
  | "targeted"
  | "contacted"
  | "engaged"
  | "active_relationship"
  | "paused";

export interface Relationship {
  id: string;
  user_id: string;
  hcp_id: string;
  status: RelationshipStatus;
  next_action_text: string | null;
  next_action_due_at: string | null;
  next_action_completed_at: string | null;
  created_from: string | null;
  first_added_at: string;
  last_interaction_at: string;
  updated_at: string;
}

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
}

export interface WatchlistItem {
  watchlist_id: string;
  relationship_id: string;
  added_at: string;
  pinned: boolean;
  list_note: string | null;
  sort_order: number;
}

export type RelationshipMap = Map<string, Relationship>;

const relationshipsCache = new Map<string, Promise<RelationshipMap>>();
const watchlistsCache = new Map<string, Promise<Watchlist[]>>();

export function clearRelationshipsCache(userId: string): void {
  relationshipsCache.delete(userId);
}

export function clearWatchlistsCache(userId: string): void {
  watchlistsCache.delete(userId);
}

function invalidateUserCaches(userId: string): void {
  clearRelationshipsCache(userId);
  clearWatchlistsCache(userId);
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

async function fetchRelationshipMapUncached(userId: string): Promise<RelationshipMap> {
  const { data, error } = await supabase
    .from("msl_hcp_relationships")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.warn("fetchRelationshipMapUncached: supabase error", error);
    throw error;
  }

  const map = new Map<string, Relationship>();
  for (const row of data ?? []) {
    const rel = row as Relationship;
    map.set(rel.hcp_id, rel);
  }
  return map;
}

export async function getRelationshipMap(userId: string): Promise<RelationshipMap> {
  const existing = relationshipsCache.get(userId);
  if (existing) return existing;

  const promise = fetchRelationshipMapUncached(userId);
  relationshipsCache.set(userId, promise);

  promise.catch(() => {
    relationshipsCache.delete(userId);
  });

  return promise;
}

export async function getRelationship(
  userId: string,
  hcpId: string,
): Promise<Relationship | null> {
  try {
    const map = await getRelationshipMap(userId);
    return map.get(hcpId) ?? null;
  } catch (err) {
    console.warn("getRelationship: error", err);
    throw err;
  }
}

export async function getOrCreateRelationship(
  userId: string,
  hcpId: string,
  createdFrom: string | null,
): Promise<Relationship> {
  try {
    const existing = await getRelationship(userId, hcpId);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("msl_hcp_relationships")
      .insert({
        user_id: userId,
        hcp_id: hcpId,
        status: "not_engaged",
        created_from: createdFrom,
      })
      .select()
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        invalidateUserCaches(userId);
        const retry = await getRelationship(userId, hcpId);
        if (retry) return retry;
      }
      console.warn("getOrCreateRelationship: supabase error", error);
      throw error;
    }

    invalidateUserCaches(userId);
    return data as Relationship;
  } catch (err) {
    if (!(err && typeof err === "object" && "code" in err)) {
      console.warn("getOrCreateRelationship: error", err);
    }
    throw err;
  }
}

async function fetchWatchlistsUncached(userId: string): Promise<Watchlist[]> {
  const { data, error } = await supabase
    .from("msl_watchlists")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("fetchWatchlistsUncached: supabase error", error);
    throw error;
  }

  return (data ?? []) as Watchlist[];
}

export async function getWatchlists(userId: string): Promise<Watchlist[]> {
  const existing = watchlistsCache.get(userId);
  if (existing) return existing;

  const promise = fetchWatchlistsUncached(userId);
  watchlistsCache.set(userId, promise);

  promise.catch(() => {
    watchlistsCache.delete(userId);
  });

  return promise;
}

export async function createWatchlist(
  userId: string,
  params: { name: string; description?: string; color?: string; isDefault?: boolean },
): Promise<Watchlist> {
  try {
    const { data, error } = await supabase
      .from("msl_watchlists")
      .insert({
        user_id: userId,
        name: params.name,
        description: params.description ?? null,
        color: params.color ?? null,
        is_default: params.isDefault ?? false,
      })
      .select()
      .single();

    if (error) {
      console.warn("createWatchlist: supabase error", error);
      throw error;
    }

    invalidateUserCaches(userId);
    return data as Watchlist;
  } catch (err) {
    if (!(err && typeof err === "object" && "code" in err)) {
      console.warn("createWatchlist: error", err);
    }
    throw err;
  }
}

export async function addHcpToDefaultOrCreate(
  userId: string,
  hcpId: string,
  createdFrom: string | null,
): Promise<{ watchlist: Watchlist; relationship: Relationship }> {
  try {
    const relationship = await getOrCreateRelationship(userId, hcpId, createdFrom);

    const watchlists = await getWatchlists(userId);
    let watchlist: Watchlist;

    if (watchlists.length === 0) {
      watchlist = await createWatchlist(userId, { name: "Watching", isDefault: true });
    } else {
      watchlist = watchlists.find((w) => w.is_default) ?? watchlists[0];
    }

    const { error: itemError } = await supabase.from("msl_watchlist_items").insert({
      watchlist_id: watchlist.id,
      relationship_id: relationship.id,
    });

    if (itemError && !isUniqueViolation(itemError)) {
      console.warn("addHcpToDefaultOrCreate: insert watchlist item error", itemError);
      throw itemError;
    }

    invalidateUserCaches(userId);
    return { watchlist, relationship };
  } catch (err) {
    if (!(err && typeof err === "object" && "code" in err)) {
      console.warn("addHcpToDefaultOrCreate: error", err);
    }
    throw err;
  }
}

export async function addToWatchlist(
  userId: string,
  watchlistId: string,
  hcpId: string,
  createdFrom: string | null,
): Promise<void> {
  try {
    const relationship = await getOrCreateRelationship(userId, hcpId, createdFrom);

    const { error } = await supabase.from("msl_watchlist_items").insert({
      watchlist_id: watchlistId,
      relationship_id: relationship.id,
    });

    if (error && !isUniqueViolation(error)) {
      console.warn("addToWatchlist: supabase error", error);
      throw error;
    }

    invalidateUserCaches(userId);
  } catch (err) {
    if (!(err && typeof err === "object" && "code" in err)) {
      console.warn("addToWatchlist: error", err);
    }
    throw err;
  }
}

export async function removeFromWatchlist(
  userId: string,
  watchlistId: string,
  relationshipId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("msl_watchlist_items")
      .delete()
      .eq("watchlist_id", watchlistId)
      .eq("relationship_id", relationshipId);

    if (error) {
      console.warn("removeFromWatchlist: supabase error", error);
      throw error;
    }

    invalidateUserCaches(userId);
  } catch (err) {
    console.warn("removeFromWatchlist: error", err);
    throw err;
  }
}

type WatchlistItemRow = WatchlistItem & {
  msl_hcp_relationships: { hcp_id: string } | { hcp_id: string }[] | null;
};

export async function getWatchlistItems(
  userId: string,
  watchlistId: string,
): Promise<Array<WatchlistItem & { hcp_id: string }>> {
  try {
    const { data, error } = await supabase
      .from("msl_watchlist_items")
      .select(
        "watchlist_id, relationship_id, added_at, pinned, list_note, sort_order, msl_hcp_relationships!inner(hcp_id, user_id)",
      )
      .eq("watchlist_id", watchlistId)
      .eq("msl_hcp_relationships.user_id", userId)
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("added_at", { ascending: false });

    if (error) {
      console.warn("getWatchlistItems: supabase error", error);
      throw error;
    }

    return (data ?? []).map((row) => {
      const item = row as WatchlistItemRow;
      const rel = item.msl_hcp_relationships;
      const hcpId = Array.isArray(rel) ? rel[0]?.hcp_id : rel?.hcp_id;
      return {
        watchlist_id: item.watchlist_id,
        relationship_id: item.relationship_id,
        added_at: item.added_at,
        pinned: item.pinned,
        list_note: item.list_note,
        sort_order: item.sort_order,
        hcp_id: hcpId ?? "",
      };
    });
  } catch (err) {
    console.warn("getWatchlistItems: error", err);
    throw err;
  }
}
