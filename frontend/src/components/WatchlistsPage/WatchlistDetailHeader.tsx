import type { Watchlist } from "../../lib/watchlists";

interface Props {
  watchlist: Watchlist;
  onEdit: () => void;
}

export default function WatchlistDetailHeader({ watchlist, onEdit }: Props) {
  const hcpLabel = watchlist.item_count === 1 ? "1 HCP" : `${watchlist.item_count} HCPs`;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {watchlist.color ? (
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: watchlist.color,
                  flexShrink: 0,
                }}
              />
            ) : null}
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "#F2F0EA",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {watchlist.name}
            </h2>
          </div>
          {watchlist.description ? (
            <p style={{ fontSize: 12.5, color: "#928E86", margin: "4px 0 0 0", lineHeight: 1.5 }}>
              {watchlist.description}
            </p>
          ) : null}
          <span
            style={{
              display: "inline-block",
              marginTop: 8,
              fontSize: 11,
              color: "#928E86",
              backgroundColor: "#0d0c0b",
              borderRadius: 6,
              padding: "3px 9px",
            }}
          >
            {hcpLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          style={{
            background: "none",
            border: "none",
            color: "#E8A020",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "2px 0",
            flexShrink: 0,
          }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
