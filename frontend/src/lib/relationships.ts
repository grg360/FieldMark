import { supabase } from "./supabase";
import { track } from "./analytics";

export type RelationshipStatus =
  | "not_engaged"
  | "targeted"
  | "contacted"
  | "engaged"
  | "active_relationship"
  | "paused";

export type Priority = "low" | "normal" | "high";

export interface Relationship {
  id: string;
  user_id: string;
  hcp_id: string;
  status: RelationshipStatus;
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

export async function updateRelationshipStatus(
  userId: string,
  relationshipId: string,
  status: RelationshipStatus,
): Promise<Relationship> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_relationships")
      .update({ status })
      .eq("id", relationshipId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.warn("updateRelationshipStatus: supabase error", error);
      throw error;
    }

    invalidateUserCaches(userId);
    return data as Relationship;
  } catch (err) {
    if (!(err && typeof err === "object" && "code" in err)) {
      console.warn("updateRelationshipStatus: error", err);
    }
    throw err;
  }
}

export async function createNextAction(
  userId: string,
  params: CreateNextActionParams,
): Promise<NextAction> {
  const trimmedBody = params.body.trim();
  if (trimmedBody.length === 0) {
    throw new Error("Next action body cannot be empty");
  }

  try {
    const result = await addHcpToDefaultOrCreate(
      userId,
      params.hcpId,
      params.createdFrom ?? "hcp_detail_followup",
    );
    const relationship = result.relationship;

    const insertPayload: {
      relationship_id: string;
      user_id: string;
      body: string;
      due_at?: string | null;
      priority?: Priority;
      created_from?: string | null;
    } = {
      relationship_id: relationship.id,
      user_id: userId,
      body: trimmedBody,
    };

    if (params.dueAt !== undefined) {
      insertPayload.due_at = params.dueAt;
    }
    if (params.priority !== undefined) {
      insertPayload.priority = params.priority;
    }
    if (params.createdFrom !== undefined) {
      insertPayload.created_from = params.createdFrom;
    }

    const { data, error } = await supabase
      .from("msl_hcp_next_actions")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.warn("createNextAction: supabase error", error);
      throw error;
    }

    const action = data as NextAction;

    // Fires only after the insert confirms. Covers both callers (brief save +
    // inline composer); created_from is an enum, no PII.
    track("followup_created", { created_from: params.createdFrom ?? "hcp_detail_followup" });

    const { error: relError } = await supabase
      .from("msl_hcp_relationships")
      .update({ last_interaction_at: new Date().toISOString() })
      .eq("id", relationship.id)
      .eq("user_id", userId);

    if (relError) {
      console.warn("createNextAction: last_interaction_at update error", relError);
    }

    invalidateUserCaches(userId);
    return action;
  } catch (err) {
    if (!(err instanceof Error && err.message === "Next action body cannot be empty")) {
      if (!(err && typeof err === "object" && "code" in err)) {
        console.warn("createNextAction: error", err);
      }
    }
    throw err;
  }
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

function sortFollowUps(items: NextAction[]): NextAction[] {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aOverdue = a.due_at && new Date(a.due_at).getTime() < now ? 0 : 1;
    const bOverdue = b.due_at && new Date(b.due_at).getTime() < now ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    const aPrio = PRIORITY_RANK[a.priority] ?? 1;
    const bPrio = PRIORITY_RANK[b.priority] ?? 1;
    if (aPrio !== bPrio) return aPrio - bPrio;

    const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function getOpenNextActionsForRelationship(
  userId: string,
  relationshipId: string,
): Promise<NextAction[]> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_next_actions")
      .select("*")
      .eq("relationship_id", relationshipId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("completed_at", null);

    if (error) {
      console.warn("getOpenNextActionsForRelationship: supabase error", error);
      throw error;
    }

    const rows = (data ?? []) as NextAction[];
    return sortFollowUps(rows);
  } catch (err) {
    console.warn("getOpenNextActionsForRelationship: error", err);
    throw err;
  }
}

export async function getNextActionHistoryForRelationship(
  userId: string,
  relationshipId: string,
): Promise<NextAction[]> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_next_actions")
      .select("*")
      .eq("relationship_id", relationshipId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("completed_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("getNextActionHistoryForRelationship: supabase error", error);
      throw error;
    }

    return (data ?? []) as NextAction[];
  } catch (err) {
    console.warn("getNextActionHistoryForRelationship: error", err);
    throw err;
  }
}

export async function updateNextAction(
  userId: string,
  actionId: string,
  updates: UpdateNextActionParams,
): Promise<NextAction> {
  if (updates.body !== undefined) {
    const trimmedBody = updates.body.trim();
    if (trimmedBody.length === 0) {
      throw new Error("Next action body cannot be empty");
    }
  }

  try {
    const updatePayload: {
      body?: string;
      due_at?: string | null;
      completed_at?: string | null;
      priority?: Priority;
    } = {};

    if (updates.body !== undefined) {
      updatePayload.body = updates.body.trim();
    }
    if (updates.dueAt !== undefined) {
      updatePayload.due_at = updates.dueAt;
    }
    if (updates.completedAt !== undefined) {
      updatePayload.completed_at = updates.completedAt;
    }
    if (updates.priority !== undefined) {
      updatePayload.priority = updates.priority;
    }

    const { data, error } = await supabase
      .from("msl_hcp_next_actions")
      .update(updatePayload)
      .eq("id", actionId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.warn("updateNextAction: supabase error", error);
      throw error;
    }

    const action = data as NextAction;

    // Fires only on a successful completion. Gated on completedAt being truthy —
    // it's only ever set to a timestamp (no un-complete path), so no false
    // positives from snooze/edit updates. Covers both completion call sites.
    if (updates.completedAt) {
      track("followup_completed");
    }

    if (updates.completedAt !== undefined) {
      const { error: relError } = await supabase
        .from("msl_hcp_relationships")
        .update({ last_interaction_at: new Date().toISOString() })
        .eq("id", action.relationship_id)
        .eq("user_id", userId);

      if (relError) {
        console.warn("updateNextAction: last_interaction_at update error", relError);
      }
    }

    invalidateUserCaches(userId);
    return action;
  } catch (err) {
    if (!(err instanceof Error && err.message === "Next action body cannot be empty")) {
      if (!(err && typeof err === "object" && "code" in err)) {
        console.warn("updateNextAction: error", err);
      }
    }
    throw err;
  }
}

export async function softDeleteNextAction(userId: string, actionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("msl_hcp_next_actions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", actionId)
      .eq("user_id", userId);

    if (error) {
      console.warn("softDeleteNextAction: supabase error", error);
      throw error;
    }

    invalidateUserCaches(userId);
  } catch (err) {
    console.warn("softDeleteNextAction: error", err);
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

export type InteractionType =
  | "general"
  | "meeting"
  | "email"
  | "phone"
  | "conference"
  | "publication_review"
  | "internal"
  | "advisory_board"
  | "tumor_board"
  | "other";

export type NoteVisibility = "private" | "team" | "community";

export type AIExtractionStatus =
  | "pending"
  | "processing"
  | "extracted"
  | "failed"
  | "skipped";

export type InsightStrength = "routine" | "notable" | "strategic";

export interface NextAction {
  id: string;
  relationship_id: string;
  user_id: string;
  body: string;
  due_at: string | null;
  completed_at: string | null;
  priority: Priority;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateNextActionParams {
  hcpId: string;
  body: string;
  dueAt?: string | null;
  priority?: Priority;
  createdFrom?: string | null;
}

export interface UpdateNextActionParams {
  body?: string;
  dueAt?: string | null;
  completedAt?: string | null;
  priority?: Priority;
}

export interface Note {
  id: string;
  relationship_id: string;
  user_id: string;
  body: string;
  interaction_type: InteractionType;
  visibility: NoteVisibility;
  insight_strength: InsightStrength;
  occurred_at: string;
  ai_extraction_status: AIExtractionStatus;
  ai_extracted_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  insight_category: string | null;
  insight_category_other_label: string | null;
  why_it_matters: string | null;
  interaction_type_other_label: string | null;
  belief_claim_key: string | null;
  belief_claim_title: string | null;
}

export interface CreateNoteParams {
  hcpId: string;
  body: string;
  interactionType?: InteractionType;
  insightStrength?: InsightStrength;
  occurredAt?: string;
  createdFrom?: string | null;
  insightCategory?: string | null;
  insightCategoryOtherLabel?: string | null;
  whyItMatters?: string | null;
  interactionTypeOtherLabel?: string | null;
}

export interface UpdateNoteParams {
  body?: string;
  interactionType?: InteractionType;
  insightStrength?: InsightStrength;
  occurredAt?: string;
  insightCategory?: string | null;
  insightCategoryOtherLabel?: string | null;
  whyItMatters?: string | null;
  interactionTypeOtherLabel?: string | null;
}

export async function createNote(userId: string, params: CreateNoteParams): Promise<Note> {
  const trimmedBody = params.body.trim();
  if (trimmedBody.length === 0) {
    throw new Error("Note body cannot be empty");
  }

  try {
    const result = await addHcpToDefaultOrCreate(
      userId,
      params.hcpId,
      params.createdFrom ?? "hcp_detail_insight",
    );
    const relationship = result.relationship;

    const insertPayload: {
      relationship_id: string;
      user_id: string;
      body: string;
      interaction_type?: InteractionType;
      insight_strength?: InsightStrength;
      occurred_at?: string;
      insight_category?: string | null;
      insight_category_other_label?: string | null;
      why_it_matters?: string | null;
      interaction_type_other_label?: string | null;
    } = {
      relationship_id: relationship.id,
      user_id: userId,
      body: trimmedBody,
    };

    if (params.interactionType) {
      insertPayload.interaction_type = params.interactionType;
    }
    if (params.insightStrength) {
      insertPayload.insight_strength = params.insightStrength;
    }
    if (params.occurredAt) {
      insertPayload.occurred_at = params.occurredAt;
    }
    if (params.insightCategory !== undefined) {
      insertPayload.insight_category = params.insightCategory;
    }
    if (params.insightCategoryOtherLabel !== undefined) {
      insertPayload.insight_category_other_label = params.insightCategoryOtherLabel;
    }
    if (params.whyItMatters !== undefined) {
      insertPayload.why_it_matters = params.whyItMatters;
    }
    if (params.interactionTypeOtherLabel !== undefined) {
      insertPayload.interaction_type_other_label = params.interactionTypeOtherLabel;
    }

    const { data, error } = await supabase
      .from("msl_hcp_notes")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.warn("createNote: supabase error", error);
      throw error;
    }

    const note = data as Note;

    const { error: relError } = await supabase
      .from("msl_hcp_relationships")
      .update({ last_interaction_at: note.occurred_at })
      .eq("id", relationship.id)
      .eq("user_id", userId);

    if (relError) {
      console.warn("createNote: last_interaction_at update error", relError);
    }

    clearRelationshipsCache(userId);
    clearWatchlistsCache(userId);
    return note;
  } catch (err) {
    if (!(err instanceof Error && err.message === "Note body cannot be empty")) {
      if (!(err && typeof err === "object" && "code" in err)) {
        console.warn("createNote: error", err);
      }
    }
    throw err;
  }
}

export async function getNotesForRelationship(
  userId: string,
  relationshipId: string,
): Promise<Note[]> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_notes")
      .select("*")
      .eq("relationship_id", relationshipId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("getNotesForRelationship: supabase error", error);
      throw error;
    }

    return (data ?? []) as Note[];
  } catch (err) {
    console.warn("getNotesForRelationship: error", err);
    throw err;
  }
}

export async function getNotesForHcp(userId: string, hcpId: string): Promise<Note[]> {
  try {
    const map = await getRelationshipMap(userId);
    const relationship = map.get(hcpId);
    if (!relationship) return [];

    return getNotesForRelationship(userId, relationship.id);
  } catch (err) {
    console.warn("getNotesForHcp: error", err);
    throw err;
  }
}

export async function updateNote(
  userId: string,
  noteId: string,
  updates: UpdateNoteParams,
): Promise<Note> {
  if (updates.body !== undefined) {
    const trimmedBody = updates.body.trim();
    if (trimmedBody.length === 0) {
      throw new Error("Note body cannot be empty");
    }
  }

  try {
    const updatePayload: {
      body?: string;
      interaction_type?: InteractionType;
      insight_strength?: InsightStrength;
      occurred_at?: string;
      insight_category?: string | null;
      insight_category_other_label?: string | null;
      why_it_matters?: string | null;
      interaction_type_other_label?: string | null;
    } = {};

    if (updates.body !== undefined) {
      updatePayload.body = updates.body.trim();
    }
    if (updates.interactionType !== undefined) {
      updatePayload.interaction_type = updates.interactionType;
    }
    if (updates.insightStrength !== undefined) {
      updatePayload.insight_strength = updates.insightStrength;
    }
    if (updates.insightCategory !== undefined) {
      updatePayload.insight_category = updates.insightCategory;
    }
    if (updates.insightCategoryOtherLabel !== undefined) {
      updatePayload.insight_category_other_label = updates.insightCategoryOtherLabel;
    }
    if (updates.whyItMatters !== undefined) {
      updatePayload.why_it_matters = updates.whyItMatters;
    }
    if (updates.interactionTypeOtherLabel !== undefined) {
      updatePayload.interaction_type_other_label = updates.interactionTypeOtherLabel;
    }
    if (updates.occurredAt !== undefined) {
      updatePayload.occurred_at = updates.occurredAt;
    }

    const { data, error } = await supabase
      .from("msl_hcp_notes")
      .update(updatePayload)
      .eq("id", noteId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.warn("updateNote: supabase error", error);
      throw error;
    }

    const note = data as Note;

    if (updates.occurredAt !== undefined) {
      const { error: relError } = await supabase
        .from("msl_hcp_relationships")
        .update({ last_interaction_at: updates.occurredAt })
        .eq("id", note.relationship_id)
        .eq("user_id", userId);

      if (relError) {
        console.warn("updateNote: last_interaction_at update error", relError);
      }
    }

    clearRelationshipsCache(userId);
    clearWatchlistsCache(userId);
    return note;
  } catch (err) {
    if (!(err instanceof Error && err.message === "Note body cannot be empty")) {
      if (!(err && typeof err === "object" && "code" in err)) {
        console.warn("updateNote: error", err);
      }
    }
    throw err;
  }
}

export async function softDeleteNote(userId: string, noteId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("msl_hcp_notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", noteId)
      .eq("user_id", userId);

    if (error) {
      console.warn("softDeleteNote: supabase error", error);
      throw error;
    }

    clearRelationshipsCache(userId);
    clearWatchlistsCache(userId);
  } catch (err) {
    console.warn("softDeleteNote: error", err);
    throw err;
  }
}

export async function getRecentNotesForUser(
  userId: string,
  limit: number = 50,
): Promise<Note[]> {
  const cappedLimit = Math.min(limit, 200);

  try {
    const { data, error } = await supabase
      .from("msl_hcp_notes")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    if (error) {
      console.warn("getRecentNotesForUser: supabase error", error);
      throw error;
    }

    return (data ?? []) as Note[];
  } catch (err) {
    console.warn("getRecentNotesForUser: error", err);
    throw err;
  }
}
