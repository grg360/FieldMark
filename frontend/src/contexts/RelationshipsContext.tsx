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

interface RelationshipsContextValue {
  relationshipMap: RelationshipMap;
  isSaved: (hcpId: string) => boolean;
  toggleSave: (hcpId: string, createdFrom: string) => Promise<void>;
  isLoading: boolean;
}

const RelationshipsContext = createContext<RelationshipsContextValue | undefined>(undefined);

export function RelationshipsProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [relationshipMap, setRelationshipMap] = useState<RelationshipMap>(new Map());
  const [savedHcpIds, setSavedHcpIds] = useState<Set<string>>(new Set());
  const [defaultWatchlistId, setDefaultWatchlistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadGenerationRef = useRef(0);

  const resetState = useCallback(() => {
    setUserId(null);
    setRelationshipMap(new Map());
    setSavedHcpIds(new Set());
    setDefaultWatchlistId(null);
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
      const [map, watchlists] = await Promise.all([
        getRelationshipMap(user.id),
        getWatchlists(user.id),
      ]);
      if (myGen !== loadGenerationRef.current) return;

      setRelationshipMap(new Map(map));

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
    }),
    [relationshipMap, isSaved, toggleSave, isLoading],
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
