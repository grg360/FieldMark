import { useEffect, useState, useRef, type CSSProperties } from "react";
import {
  getWatchlistsForUser,
  getWatchlistMembershipsForRelationship,
  addHcpToWatchlist,
  removeHcpFromWatchlist,
  createWatchlist,
  type Watchlist,
} from "../lib/watchlists";

interface Props {
  userId: string;
  relationshipId: string;
  anchorRect: DOMRect | null;
  onClose: () => void;
}

export default function AddToWatchlistPopover({
  userId,
  relationshipId,
  anchorRect,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorByListId, setErrorByListId] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [lists, mems] = await Promise.all([
          getWatchlistsForUser(userId),
          getWatchlistMembershipsForRelationship(userId, relationshipId),
        ]);
        if (cancelled) return;
        setWatchlists(lists);
        setMemberships(mems);
      } catch (err) {
        console.warn("AddToWatchlistPopover: load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, relationshipId]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function handleToggle(listId: string) {
    if (togglingId) return;
    const wasMember = memberships.has(listId);
    setTogglingId(listId);
    setErrorByListId((prev) => {
      const next = { ...prev };
      delete next[listId];
      return next;
    });

    setMemberships((prev) => {
      const next = new Set(prev);
      if (wasMember) next.delete(listId);
      else next.add(listId);
      return next;
    });

    try {
      if (wasMember) {
        await removeHcpFromWatchlist(userId, listId, relationshipId);
      } else {
        await addHcpToWatchlist(userId, listId, relationshipId);
      }
      setWatchlists((prev) =>
        prev.map((w) =>
          w.id === listId ? { ...w, item_count: w.item_count + (wasMember ? -1 : 1) } : w,
        ),
      );
    } catch (err) {
      setMemberships((prev) => {
        const next = new Set(prev);
        if (wasMember) next.add(listId);
        else next.delete(listId);
        return next;
      });
      const message = err instanceof Error ? err.message : "Toggle failed";
      setErrorByListId((prev) => ({ ...prev, [listId]: message }));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const newList = await createWatchlist(userId, trimmed, null, null);
      await addHcpToWatchlist(userId, newList.id, relationshipId);
      setWatchlists((prev) => [...prev, { ...newList, item_count: 1 }]);
      setMemberships((prev) => {
        const next = new Set(prev);
        next.add(newList.id);
        return next;
      });
      setNewName("");
      setShowCreate(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create failed";
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  function computePanelPosition(): CSSProperties {
    if (!anchorRect) {
      return { position: "fixed", top: 80, right: 16 };
    }
    const PANEL_WIDTH = 280;
    const SCREEN_PAD = 8;
    const top = anchorRect.bottom + 6;
    let right = window.innerWidth - anchorRect.right;
    const leftEdgeIfRightAligned = window.innerWidth - right - PANEL_WIDTH;
    if (leftEdgeIfRightAligned < SCREEN_PAD) {
      right = window.innerWidth - PANEL_WIDTH - SCREEN_PAD;
    }
    return { position: "fixed", top, right, width: PANEL_WIDTH };
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add to watchlist"
      style={{
        ...computePanelPosition(),
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        zIndex: 200,
        maxHeight: 400,
        overflowY: "auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ padding: "12px 14px 8px 14px", borderBottom: "1px solid #1E1E22" }}>
        <div
          style={{
            fontSize: 10,
            color: "#6B6A65",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          Add to Watchlist
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 16, fontSize: 12, color: "#6B6A65", textAlign: "center" }}>
          Loading...
        </div>
      ) : (
        <>
          <div style={{ maxHeight: 250, overflowY: "auto" }}>
            {watchlists.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: "#9B9892", textAlign: "center" }}>
                No watchlists yet. Create your first one below.
              </div>
            ) : (
              watchlists.map((w) => {
                const isMember = memberships.has(w.id);
                const error = errorByListId[w.id];
                return (
                  <div key={w.id}>
                    <button
                      type="button"
                      onClick={() => void handleToggle(w.id)}
                      disabled={togglingId === w.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "10px 14px",
                        background: "transparent",
                        border: "none",
                        cursor: togglingId === w.id ? "default" : "pointer",
                        fontFamily: "inherit",
                        color: "#E8E6DF",
                        opacity: togglingId === w.id ? 0.6 : 1,
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          border: `1.5px solid ${isMember ? "#3FB8AF" : "#3A3A3F"}`,
                          backgroundColor: isMember ? "#3FB8AF" : "transparent",
                          marginRight: 10,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#0A0A0B",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {isMember ? String.fromCharCode(0x2713) : ""}
                      </span>

                      {w.color ? (
                        <span
                          style={{
                            width: 3,
                            height: 14,
                            borderRadius: 2,
                            backgroundColor: w.color,
                            marginRight: 8,
                            flexShrink: 0,
                          }}
                        />
                      ) : null}

                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {w.name}
                      </span>

                      <span
                        style={{ fontSize: 11, color: "#6B6A65", marginLeft: 8, flexShrink: 0 }}
                      >
                        {w.item_count}
                      </span>
                    </button>
                    {error ? (
                      <div style={{ padding: "0 14px 8px 38px", fontSize: 10, color: "#E84545" }}>
                        {error}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ borderTop: "1px solid #1E1E22", padding: "8px 10px" }}>
            {showCreate ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreate();
                    }
                    if (e.key === "Escape") {
                      setShowCreate(false);
                      setNewName("");
                    }
                  }}
                  placeholder="Watchlist name"
                  autoFocus
                  disabled={creating}
                  style={{
                    backgroundColor: "#0A0A0B",
                    border: "1px solid #1E1E22",
                    borderRadius: 4,
                    color: "#E8E6DF",
                    fontSize: 13,
                    padding: "6px 8px",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                {createError ? (
                  <div style={{ fontSize: 10, color: "#E84545" }}>{createError}</div>
                ) : null}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={creating || !newName.trim()}
                    className="fm-pill-button"
                    style={{
                      backgroundColor: "#E8A020",
                      color: "#0A0A0B",
                      border: "none",
                      borderRadius: 3,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: creating || !newName.trim() ? "default" : "pointer",
                      fontFamily: "inherit",
                      opacity: creating || !newName.trim() ? 0.6 : 1,
                    }}
                  >
                    {creating ? "Creating..." : "Create + Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setNewName("");
                      setCreateError(null);
                    }}
                    disabled={creating}
                    className="fm-pill-button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#9B9892",
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: "4px 8px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="fm-pill-button"
                style={{
                  background: "none",
                  border: "none",
                  color: "#9B9892",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: "6px 4px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                + Create new watchlist
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
