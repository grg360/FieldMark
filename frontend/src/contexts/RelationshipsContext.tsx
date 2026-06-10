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
  addHcpToDefaultOrCreate,
  removeFromWatchlist,
  getWatchlists,
  getWatchlistItems,
  type RelationshipMap,
} from "../lib/relationships";
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
  isSaved: (hcpId: string) => boolean;
  toggleSave: (hcpId: string, createdFrom: string) => Promise<void>;
  isLoading: boolean;
  getInsightCount: (hcpId: string) => number;
  refreshInsightCounts: () => Promise<void>;
  getFollowUpInfo: (hcpId: string) => { openCount: number; hasOverdue: boolean };
  refreshFollowUpInfo: () => Promise<void>;
  hasBrief: (hcpId: string) => boolean;
  refreshBriefExists: () => Promise<void>;
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

      if (listId) {
        const items = await getWatchlistItems(user.id, listId);
        if (myGen !== loadGenerationRef.current) return;
        setSavedHcpIds(new Set(items.map((item) => item.hcp_id).filter(Boolean)));
      } else {
        setSavedHcpIds(new Set());
      }
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

  const isSaved = useCallback(
    (hcpId: string) => savedHcpIds.has(hcpId),
    [savedHcpIds],
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

          const items = await getWatchlistItems(userId, result.watchlist.id);
          setSavedHcpIds(new Set(items.map((item) => item.hcp_id).filter(Boolean)));
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

          const items = await getWatchlistItems(userId, listId);
          setSavedHcpIds(new Set(items.map((item) => item.hcp_id).filter(Boolean)));

          const map = await getRelationshipMap(userId);
          setRelationshipMap(new Map(map));
        }
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
      toggleSave,
      isLoading,
      getInsightCount,
      refreshInsightCounts,
      getFollowUpInfo,
      refreshFollowUpInfo,
      hasBrief,
      refreshBriefExists,
    }),
    [relationshipMap, isSaved, toggleSave, isLoading, getInsightCount, refreshInsightCounts, getFollowUpInfo, refreshFollowUpInfo, hasBrief, refreshBriefExists],
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
