import type { CSSProperties } from "react";
import type { Watchlist } from "../../lib/watchlists";

interface Props {
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  viewMode: "all_tracked" | "watchlist" | "not_found";
  isMobile: boolean;
  onSelectAllTracked: () => void;
  onSelectWatchlist: (id: string) => void;
  onCreateWatchlist: () => void;
}

const itemBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  backgroundColor: "transparent",
  color: "#E8E6DF",
  fontSize: 13,
  boxSizing: "border-box",
};

function SidebarItem({
  label,
  count,
  color,
  active,
  isMobile,
  icon,
  onClick,
}: {
  label: string;
  count?: number;
  color?: string | null;
  active: boolean;
  isMobile: boolean;
  icon?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...itemBase,
        padding: isMobile ? "8px 12px" : "10px 12px",
        // Selected nav item → warm-neutral raised fill (kept neutral, not indigo, per boundary).
        backgroundColor: active ? "#1c1b18" : "transparent",
        flexShrink: isMobile ? 0 : undefined,
        whiteSpace: isMobile ? "nowrap" : undefined,
      }}
    >
      {color ? (
        <span
          style={{
            width: 3,
            alignSelf: "stretch",
            borderRadius: 2,
            backgroundColor: color,
            flexShrink: 0,
          }}
        />
      ) : icon ? (
        <span style={{ fontSize: 14, flexShrink: 0, width: 16, textAlign: "center" }}>{icon}</span>
      ) : null}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {count != null ? (
        <span style={{ fontSize: 11, color: "#6B6A65", flexShrink: 0 }}>{count}</span>
      ) : null}
    </button>
  );
}

export default function WatchlistsSidebar({
  watchlists,
  activeWatchlistId,
  viewMode,
  isMobile,
  onSelectAllTracked,
  onSelectWatchlist,
  onCreateWatchlist,
}: Props) {
  const allTrackedActive = viewMode === "all_tracked";

  if (isMobile) {
    return (
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <SidebarItem
            label="All Tracked"
            active={allTrackedActive}
            isMobile
            icon={String.fromCodePoint(0x1f4cb)}
            onClick={onSelectAllTracked}
          />
          {watchlists.map((w) => (
            <SidebarItem
              key={w.id}
              label={w.name}
              count={w.item_count}
              color={w.color}
              active={activeWatchlistId === w.id}
              isMobile
              onClick={() => onSelectWatchlist(w.id)}
            />
          ))}
          <button
            type="button"
            onClick={onCreateWatchlist}
            style={{
              ...itemBase,
              padding: "8px 12px",
              flexShrink: 0,
              border: "1px dashed rgba(255,255,255,0.12)",
              color: "#9B9892",
              whiteSpace: "nowrap",
            }}
          >
            + New
          </button>
        </div>
        {watchlists.length > 2 ? (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 4,
              width: 24,
              background: "linear-gradient(to right, transparent, #0A0A0B)",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <SidebarItem
        label="All Tracked"
        active={allTrackedActive}
        isMobile={false}
        icon={String.fromCodePoint(0x1f4cb)}
        onClick={onSelectAllTracked}
      />

      {watchlists.map((w) => (
        <SidebarItem
          key={w.id}
          label={w.name}
          count={w.item_count}
          color={w.color}
          active={activeWatchlistId === w.id}
          isMobile={false}
          onClick={() => onSelectWatchlist(w.id)}
        />
      ))}

      <button
        type="button"
        onClick={onCreateWatchlist}
        style={{
          ...itemBase,
          marginTop: 8,
          padding: "10px 12px",
          border: "1px dashed rgba(255,255,255,0.12)",
          color: "#9B9892",
          justifyContent: "center",
        }}
      >
        + New Watchlist
      </button>
    </nav>
  );
}
