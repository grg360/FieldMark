import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../lib/authHelpers";
import { useIsDesktop } from "../../lib/useIsDesktop";
import {
  getWatchlistsForUser,
  getTrackedHcpsForUser,
  type Watchlist,
  type TrackedHcpRow,
  type TrackedSortField,
  type TrackedSortDirection,
  type TrackedStatusFilter,
  type TrackedCohortFilter,
} from "../../lib/watchlists";
import AppLayout, { type BreadcrumbItem } from "../AppLayout";
import WatchlistsSidebar from "./WatchlistsSidebar";
import TrackedHcpsList from "./TrackedHcpsList";
import TrackedHcpsFilterBar from "./TrackedHcpsFilterBar";
import WatchlistDetailHeader from "./WatchlistDetailHeader";
import CreateWatchlistModal from "./CreateWatchlistModal";
import EditWatchlistModal from "./EditWatchlistModal";

export default function WatchlistsPage() {
  const { watchlistId } = useParams<{ watchlistId?: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [userId, setUserId] = useState<string | null>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [trackedHcps, setTrackedHcps] = useState<TrackedHcpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackedLoading, setTrackedLoading] = useState(false);

  const [sortField, setSortField] = useState<TrackedSortField>("name");
  const [sortDirection, setSortDirection] = useState<TrackedSortDirection>("asc");
  const [statusFilter, setStatusFilter] = useState<TrackedStatusFilter>("all");
  const [cohortFilter, setCohortFilter] = useState<TrackedCohortFilter>("all");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null);

  const activeWatchlist = watchlistId ? (watchlists.find((w) => w.id === watchlistId) ?? null) : null;
  const viewMode: "all_tracked" | "watchlist" | "not_found" = !watchlistId
    ? "all_tracked"
    : activeWatchlist
      ? "watchlist"
      : "not_found";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const user = await getCurrentUser();
        if (!user || cancelled) return;
        setUserId(user.id);

        const lists = await getWatchlistsForUser(user.id);
        if (cancelled) return;
        setWatchlists(lists);
      } catch (err) {
        console.warn("WatchlistsPage: load watchlists error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTracked = useCallback(async () => {
    if (!userId) return;
    setTrackedLoading(true);
    try {
      const rows = await getTrackedHcpsForUser(userId, {
        sortField,
        sortDirection,
        statusFilter,
        cohortFilter,
        watchlistId: viewMode === "watchlist" ? watchlistId : undefined,
      });
      setTrackedHcps(rows);
    } catch (err) {
      console.warn("WatchlistsPage: refresh tracked error", err);
    } finally {
      setTrackedLoading(false);
    }
  }, [userId, sortField, sortDirection, statusFilter, cohortFilter, viewMode, watchlistId]);

  useEffect(() => {
    void refreshTracked();
  }, [refreshTracked]);

  const refreshWatchlists = useCallback(async () => {
    if (!userId) return;
    try {
      const lists = await getWatchlistsForUser(userId);
      setWatchlists(lists);
    } catch (err) {
      console.warn("WatchlistsPage: refresh watchlists error", err);
    }
  }, [userId]);

  function buildBreadcrumbs(): BreadcrumbItem[] {
    if (viewMode === "watchlist" && activeWatchlist) {
      return [
        { label: "Home", path: "/me" },
        { label: "Watchlists", path: "/me/watchlists" },
        { label: activeWatchlist.name },
      ];
    }
    return [
      { label: "Home", path: "/me" },
      { label: "Watchlists" },
    ];
  }

  return (
    <>
      <AppLayout breadcrumbs={buildBreadcrumbs()}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "#F4F2EC", margin: "0 0 16px 0" }}>
          Watchlists
        </h1>

        {loading ? (
          <div style={{ fontSize: 14, color: "#6B6A65", padding: "48px 0", textAlign: "center" }}>
            Loading...
          </div>
        ) : (
          <div
            style={{
              display: isDesktop ? "grid" : "flex",
              gridTemplateColumns: isDesktop ? "260px 1fr" : undefined,
              flexDirection: isDesktop ? undefined : "column",
              gap: isDesktop ? 24 : 12,
            }}
          >
            <WatchlistsSidebar
              watchlists={watchlists}
              activeWatchlistId={watchlistId ?? null}
              viewMode={viewMode}
              isMobile={!isDesktop}
              onSelectAllTracked={() => navigate("/me/watchlists")}
              onSelectWatchlist={(id) => navigate(`/me/watchlists/${id}`)}
              onCreateWatchlist={() => setShowCreateModal(true)}
            />

            <div style={{ minWidth: 0 }}>
              {viewMode === "not_found" ? (
                <div style={{ padding: 24, color: "#9B9892", fontSize: 14 }}>
                  Watchlist not found.
                </div>
              ) : (
                <>
                  {viewMode === "watchlist" && activeWatchlist ? (
                    <WatchlistDetailHeader
                      watchlist={activeWatchlist}
                      onEdit={() => setEditingWatchlist(activeWatchlist)}
                    />
                  ) : (
                    <div style={{ marginBottom: 12 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "#F2F0EA", margin: 0 }}>
                        All Tracked HCPs
                      </h2>
                      <p style={{ fontSize: 12.5, color: "#928E86", margin: "4px 0 0 0" }}>
                        Every HCP you&apos;ve tracked, across watchlists.
                      </p>
                    </div>
                  )}

                  <TrackedHcpsFilterBar
                    sortField={sortField}
                    sortDirection={sortDirection}
                    statusFilter={statusFilter}
                    cohortFilter={cohortFilter}
                    onSortFieldChange={setSortField}
                    onSortDirectionChange={setSortDirection}
                    onStatusFilterChange={setStatusFilter}
                    onCohortFilterChange={setCohortFilter}
                  />

                  <TrackedHcpsList rows={trackedHcps} loading={trackedLoading} viewMode={viewMode} />
                </>
              )}
            </div>
          </div>
        )}
      </AppLayout>

      {showCreateModal && userId ? (
        <CreateWatchlistModal
          userId={userId}
          onClose={() => setShowCreateModal(false)}
          onCreated={async (newWatchlist) => {
            setShowCreateModal(false);
            await refreshWatchlists();
            navigate(`/me/watchlists/${newWatchlist.id}`);
          }}
        />
      ) : null}

      {editingWatchlist && userId ? (
        <EditWatchlistModal
          userId={userId}
          watchlist={editingWatchlist}
          onClose={() => setEditingWatchlist(null)}
          onUpdated={async () => {
            setEditingWatchlist(null);
            await refreshWatchlists();
          }}
          onArchived={async () => {
            setEditingWatchlist(null);
            await refreshWatchlists();
            navigate("/me/watchlists");
          }}
        />
      ) : null}
    </>
  );
}
