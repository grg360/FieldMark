import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCurrentUser } from "../lib/authHelpers";
import {
  getRelationshipMap,
  getOrCreateRelationship,
  updateRelationshipStatus,
  addHcpToDefaultOrCreate,
  removeFromWatchlist,
  getWatchlists,
  type RelationshipMap,
  type RelationshipStatus,
} from "../lib/relationships";
import { getTrackedHcpIds, getWatchlistMembershipsForRelationship } from "../lib/watchlists";
import { supabase } from "../lib/supabase";

async function fetchInsightCountByHcpId(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("msl_hcp_notes")
    .select("relationship_id, msl_hcp_relationships!inner(hcp_id, user_id)")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.warn("fetchInsightCountByHcpId: supabase error", error);
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const rel = (row as { msl_hcp_relationships: { hcp_id: string } | { hcp_id: string }[] | null }).msl_hcp_relationships;
    const hcpId = Array.isArray(rel) ? rel[0]?.hcp_id : rel?.hcp_id;
    if (!hcpId) continue;
    counts.set(hcpId, (counts.get(hcpId) ?? 0) + 1);
  }
  return counts;
}

async function fetchFollowUpInfoByHcpId(userId: string): Promise<Map<string, { openCount: number; hasOverdue: boolean }>> {
  const { data, error } = await supabase
    .from("msl_hcp_next_actions")
    .select("due_at, msl_hcp_relationships!inner(hcp_id, user_id)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .is("completed_at", null);

  if (error) {
    console.warn("fetchFollowUpInfoByHcpId: supabase error", error);
    return new Map();
  }

  const now = Date.now();
  const info = new Map<string, { openCount: number; hasOverdue: boolean }>();
  for (const row of data ?? []) {
    const rel = (row as { msl_hcp_relationships: { hcp_id: string } | { hcp_id: string }[] | null; due_at: string | null }).msl_hcp_relationships;
    const hcpId = Array.isArray(rel) ? rel[0]?.hcp_id : rel?.hcp_id;
    if (!hcpId) continue;
    const dueAt = (row as { due_at: string | null }).due_at;
    const isOverdue = dueAt !== null && new Date(dueAt).getTime() < now;
    const existing = info.get(hcpId) ?? { openCount: 0, hasOverdue: false };
    info.set(hcpId, {
      openCount: existing.openCount + 1,
      hasOverdue: existing.hasOverdue || isOverdue,
    });
  }
  return info;
}

async function fetchBriefExistsByHcpId(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("msl_hcp_briefs")
    .select("hcp_id")
    .eq("user_id", userId)
    .eq("ai_status", "generated")
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.warn("fetchBriefExistsByHcpId: supabase error", error);
    return new Set();
  }

  const set = new Set<string>();
  for (const row of data ?? []) {
    const hcpId = (row as { hcp_id?: string }).hcp_id;
    if (hcpId) set.add(hcpId);
  }
  return set;
}

interface RelationshipsContextValue {
  relationshipMap: RelationshipMap;
  // isSaved and isTracked both return watchlist-union membership (the "All Tracked ·
  // across watchlists" truth). Every bookmark reader uses these; they agree by construction.
  isSaved: (hcpId: string) => boolean;
  isTracked: (hcpId: string) => boolean;
  toggleSave: (hcpId: string, createdFrom: string) => Promise<void>;
  /** The NON-DEFAULT, non-archived watchlists this HCP also sits on — id and
   *  name, so a caller can both NAME the list and LINK to it.
   *  toggleSave only ever removes from the DEFAULT list and then re-derives
   *  `tracked` as the union of all lists, so when this is non-empty an untrack
   *  cannot change the tracked state — the control would flip off and spring
   *  back. Ask first, and say so instead. Empty → removing from the default
   *  genuinely untracks them. */
  getOtherWatchlists: (hcpId: string) => Promise<{ id: string; name: string }[]>;
  refreshTracked: () => Promise<void>; // re-derive the union after watchlist-popover edits
  getStatus: (hcpId: string) => RelationshipStatus;
  setStatus: (hcpId: string, status: RelationshipStatus, createdFrom: string) => Promise<void>;
  isLoading: boolean;
  getInsightCount: (hcpId: string) => number;
  refreshInsightCounts: () => Promise<void>;
  getFollowUpInfo: (hcpId: string) => { openCount: number; hasOverdue: boolean };
  refreshFollowUpInfo: () => Promise<void>;
  hasBrief: (hcpId: string) => boolean;
  refreshBriefExists: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const RelationshipsContext = createContext<RelationshipsContextValue | undefined>(undefined);

export function RelationshipsProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [relationshipMap, setRelationshipMap] = useState<RelationshipMap>(new Map());
  const [savedHcpIds, setSavedHcpIds] = useState<Set<string>>(new Set());
  const [defaultWatchlistId, setDefaultWatchlistId] = useState<string | null>(null);
  const [insightCountByHcpId, setInsightCountByHcpId] = useState<Map<string, number>>(new Map());
  const [followUpInfoByHcpId, setFollowUpInfoByHcpId] = useState<Map<string, { openCount: number; hasOverdue: boolean }>>(new Map());
  const [briefExistsByHcpId, setBriefExistsByHcpId] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const loadGenerationRef = useRef(0);

  const resetState = useCallback(() => {
    setUserId(null);
    setRelationshipMap(new Map());
    setSavedHcpIds(new Set());
    setDefaultWatchlistId(null);
    setInsightCountByHcpId(new Map());
    setFollowUpInfoByHcpId(new Map());
    setBriefExistsByHcpId(new Set());
    setIsLoading(false);
  }, []);

  const loadUserData = useCallback(async () => {
    const myGen = ++loadGenerationRef.current;
    setIsLoading(true);
    const user = await getCurrentUser();
    if (myGen !== loadGenerationRef.current) return;

    if (!user) {
      resetState();
      return;
    }

    setUserId(user.id);

    try {
      const [map, watchlists, insightCounts, followUpInfo, briefs] = await Promise.all([
        getRelationshipMap(user.id),
        getWatchlists(user.id),
        fetchInsightCountByHcpId(user.id),
        fetchFollowUpInfoByHcpId(user.id),
        fetchBriefExistsByHcpId(user.id),
      ]);
      if (myGen !== loadGenerationRef.current) return;

      setRelationshipMap(new Map(map));
      setInsightCountByHcpId(insightCounts);
      setFollowUpInfoByHcpId(followUpInfo);
      setBriefExistsByHcpId(briefs);

      const defaultList = watchlists.find((w) => w.is_default) ?? watchlists[0] ?? null;
      const listId = defaultList?.id ?? null;
      setDefaultWatchlistId(listId);

      // tracked = member of ANY non-archived watchlist (union), not just the default and
      // not "has a relationship row". This is the truth every bookmark control reads.
      const tracked = await getTrackedHcpIds(user.id);
      if (myGen !== loadGenerationRef.current) return;
      setSavedHcpIds(tracked);
    } catch (err) {
      console.error("RelationshipsProvider: load failed", err);
    } finally {
      if (myGen === loadGenerationRef.current) setIsLoading(false);
    }
  }, [resetState]);

  useEffect(() => {
    void loadUserData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        loadGenerationRef.current += 1;
        resetState();
      } else {
        void loadUserData();
      }
    });

    return () => {
      loadGenerationRef.current += 1;
      subscription.unsubscribe();
    };
  }, [loadUserData, resetState]);

  // Bookmark truth = member of ≥1 watchlist (savedHcpIds is the union). isSaved and
  // isTracked now return the SAME thing, so every bookmark reader (HCPCard, DetailScreen,
  // cohort ledger, the two-spine profile) agrees. Previously isSaved read relationshipMap,
  // which is true for any HCP with a relationship row (status/note/follow-up) — a bookmark
  // filled for HCPs that were never tracked.
  const isSaved = useCallback((hcpId: string) => savedHcpIds.has(hcpId), [savedHcpIds]);
  const isTracked = useCallback((hcpId: string) => savedHcpIds.has(hcpId), [savedHcpIds]);

  // re-derive the tracked union (call after watchlist-popover edits, which the context
  // doesn't otherwise observe)
  const refreshTracked = useCallback(async () => {
    if (!userId) return;
    const tracked = await getTrackedHcpIds(userId);
    setSavedHcpIds(tracked);
  }, [userId]);

  const getStatus = useCallback(
    (hcpId: string): RelationshipStatus => relationshipMap.get(hcpId)?.status ?? "not_engaged",
    [relationshipMap],
  );

  // Write the relationship status to the same msl_hcp_relationships row the profile's
  // STATUS dropdown writes (creating the row if the ledger is the first touch), so the
  // ledger and profile stay in sync. Optimistic, with revert on failure.
  const setStatus = useCallback(
    async (hcpId: string, status: RelationshipStatus, createdFrom: string) => {
      if (!userId) return;
      const prev = relationshipMap.get(hcpId);
      setRelationshipMap((m) => {
        const next = new Map(m);
        const cur = next.get(hcpId);
        if (cur) next.set(hcpId, { ...cur, status });
        return next;
      });
      try {
        const rel = prev ?? (await getOrCreateRelationship(userId, hcpId, createdFrom));
        await updateRelationshipStatus(userId, rel.id, status);
        const map = await getRelationshipMap(userId); // cache invalidated by the write
        setRelationshipMap(new Map(map));
      } catch (err) {
        setRelationshipMap((m) => {
          const next = new Map(m);
          if (prev) next.set(hcpId, prev);
          return next;
        });
        console.error("setStatus failed", err);
        throw err;
      }
    },
    [userId, relationshipMap],
  );

  const getInsightCount = useCallback(
    (hcpId: string): number => insightCountByHcpId.get(hcpId) ?? 0,
    [insightCountByHcpId],
  );

  const refreshInsightCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const counts = await fetchInsightCountByHcpId(userId);
      setInsightCountByHcpId(counts);
    } catch (err) {
      console.warn("refreshInsightCounts failed", err);
    }
  }, [userId]);

  const getFollowUpInfo = useCallback(
    (hcpId: string): { openCount: number; hasOverdue: boolean } =>
      followUpInfoByHcpId.get(hcpId) ?? { openCount: 0, hasOverdue: false },
    [followUpInfoByHcpId],
  );

  const refreshFollowUpInfo = useCallback(async () => {
    if (!userId) return;
    try {
      const info = await fetchFollowUpInfoByHcpId(userId);
      setFollowUpInfoByHcpId(info);
    } catch (err) {
      console.warn("refreshFollowUpInfo failed", err);
    }
  }, [userId]);

  const hasBrief = useCallback(
    (hcpId: string): boolean => briefExistsByHcpId.has(hcpId),
    [briefExistsByHcpId],
  );

  const refreshBriefExists = useCallback(async () => {
    if (!userId) return;
    try {
      const briefs = await fetchBriefExistsByHcpId(userId);
      setBriefExistsByHcpId(briefs);
    } catch (err) {
      console.warn("refreshBriefExists failed", err);
    }
  }, [userId]);

  // Read-only. Deliberately NOT folded into toggleSave: every other surface's
  // bookmark is a plain track/untrack and must keep working exactly as it did,
  // so the policy about what to do with this answer belongs to the caller.
  const getOtherWatchlists = useCallback(
    async (hcpId: string): Promise<{ id: string; name: string }[]> => {
      if (!userId) return [];
      try {
        const rel = relationshipMap.get(hcpId) ?? (await getRelationshipMap(userId)).get(hcpId);
        if (!rel) return [];
        const [memberIds, lists] = await Promise.all([
          getWatchlistMembershipsForRelationship(userId, rel.id),
          getWatchlists(userId),
        ]);
        // Resolve the default here rather than trusting cached state: an untrack
        // that mis-identifies the default would report the list it is about to
        // remove from as a reason not to remove from it.
        const defaultId = defaultWatchlistId ?? lists.find((l) => l.is_default)?.id ?? lists[0]?.id ?? null;
        return lists.filter((l) => l.id !== defaultId && memberIds.has(l.id)).map((l) => ({ id: l.id, name: l.name }));
      } catch (err) {
        // Unknown ≠ none. Returning [] would let the caller untrack and hit the
        // spring-back this exists to prevent, so report nothing-to-say and let
        // the caller keep the current state.
        console.warn("getOtherWatchlists failed", err);
        throw err;
      }
    },
    [userId, relationshipMap, defaultWatchlistId],
  );

  const toggleSave = useCallback(
    async (hcpId: string, createdFrom: string) => {
      if (!userId) return;

      const wasSaved = savedHcpIds.has(hcpId);

      setSavedHcpIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(hcpId);
        else next.add(hcpId);
        return next;
      });

      try {
        if (!wasSaved) {
          const result = await addHcpToDefaultOrCreate(userId, hcpId, createdFrom);
          setDefaultWatchlistId(result.watchlist.id);
          const map = await getRelationshipMap(userId);
          setRelationshipMap(new Map(map));
        } else {
          let listId = defaultWatchlistId;
          if (!listId) {
            const watchlists = await getWatchlists(userId);
            const defaultList = watchlists.find((w) => w.is_default) ?? watchlists[0] ?? null;
            listId = defaultList?.id ?? null;
            setDefaultWatchlistId(listId);
          }

          if (!listId) {
            throw new Error("No default watchlist");
          }

          const rel =
            relationshipMap.get(hcpId) ?? (await getRelationshipMap(userId)).get(hcpId);
          if (!rel) {
            throw new Error("No relationship found");
          }

          await removeFromWatchlist(userId, listId, rel.id);
          const map = await getRelationshipMap(userId);
          setRelationshipMap(new Map(map));
        }
        // re-derive the tracked union: untracking the default list still leaves the HCP
        // tracked if it sits in another watchlist, and vice versa.
        const tracked = await getTrackedHcpIds(userId);
        setSavedHcpIds(tracked);
      } catch (err) {
        setSavedHcpIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(hcpId);
          else next.delete(hcpId);
          return next;
        });
        console.error("toggleSave failed", err);
        throw err;
      }
    },
    [userId, savedHcpIds, defaultWatchlistId, relationshipMap],
  );

  const value = useMemo<RelationshipsContextValue>(
    () => ({
      relationshipMap,
      isSaved,
      isTracked,
      toggleSave,
      getOtherWatchlists,
      refreshTracked,
      getStatus,
      setStatus,
      isLoading,
      getInsightCount,
      refreshInsightCounts,
      getFollowUpInfo,
      refreshFollowUpInfo,
      hasBrief,
      refreshBriefExists,
      refreshAll: loadUserData,
    }),
    [relationshipMap, isSaved, isTracked, toggleSave, getOtherWatchlists, refreshTracked, getStatus, setStatus, isLoading, getInsightCount, refreshInsightCounts, getFollowUpInfo, refreshFollowUpInfo, hasBrief, refreshBriefExists, loadUserData],
  );

  return (
    <RelationshipsContext.Provider value={value}>{children}</RelationshipsContext.Provider>
  );
}

export function useRelationships(): RelationshipsContextValue {
  const ctx = useContext(RelationshipsContext);
  if (!ctx) {
    throw new Error("useRelationships must be used within RelationshipsProvider");
  }
  return ctx;
}
