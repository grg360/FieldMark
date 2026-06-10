import { useNavigate } from "react-router-dom";

interface Props {
  viewMode: "all_tracked" | "watchlist" | "not_found";
}

export default function WatchlistsEmptyState({ viewMode }: Props) {
  const navigate = useNavigate();

  if (viewMode === "watchlist") {
    return (
      <div
        style={{
          padding: "48px 16px",
          textAlign: "center",
          color: "#9B9892",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: "0 0 8px 0", color: "#E8E6DF", fontSize: 15, fontWeight: 500 }}>
          This watchlist is empty.
        </p>
        <p style={{ margin: 0 }}>
          Add HCPs from any HCP detail page using the Add to Watchlist button.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "48px 16px",
        textAlign: "center",
        color: "#9B9892",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: "0 0 8px 0", color: "#E8E6DF", fontSize: 15, fontWeight: 500 }}>
        You haven&apos;t tracked any HCPs yet.
      </p>
      <p style={{ margin: "0 0 16px 0" }}>
        Explore cohorts or your Home page Coverage Gaps to start tracking investigators.
      </p>
      <button
        type="button"
        onClick={() => navigate("/me")}
        style={{
          background: "none",
          border: "none",
          color: "#E8A020",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
          textDecoration: "underline",
        }}
      >
        Open Coverage Gaps
      </button>
    </div>
  );
}
