import { useNavigate } from "react-router-dom";

const LINKS = [
  { label: "Watchlists", path: "/me/watchlists" },
  { label: "Institutions", path: "/institutions" },
  { label: "Saved HCPs", path: "/saved-hcps" },
  { label: "Cohorts", path: "/cohorts" },
] as const;

export default function HomeNavigationRow() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        padding: "12px 0",
        display: "flex",
        gap: 24,
        fontSize: 12,
        color: "#6B6A65",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {LINKS.map((link) => (
        <button
          key={link.path}
          type="button"
          onClick={() => navigate(link.path)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 12,
            color: "#6B6A65",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#9B9892";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#6B6A65";
          }}
        >
          {link.label}
        </button>
      ))}
    </div>
  );
}
