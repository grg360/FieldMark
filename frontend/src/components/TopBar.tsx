interface TopBarProps {
  onSearchPress?: () => void;
  onProfilePress?: () => void;
  onRefreshPress?: () => void;
  refreshing?: boolean;
}

export default function TopBar({ onSearchPress, onProfilePress, onRefreshPress, refreshing }: TopBarProps) {
  return (
    <div
      className="fm-topbar flex items-center justify-between px-4"
      style={{
        height: 48,
        borderBottom: "1px solid #1E1E22",
        backgroundColor: "#0A0A0B",
      }}
    >
      <span
        className="fm-logo"
        style={{
          fontFamily: "monospace",
          fontSize: 15,
          fontWeight: 700,
          color: "#E8A020",
          letterSpacing: "0.05em",
        }}
      >
        FM
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onRefreshPress}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          aria-label="Refresh"
        >
          <span
            style={{
              display: "inline-block",
              fontSize: 16,
              color: "#6B6A65",
              transform: refreshing ? "rotate(360deg)" : "none",
              transition: refreshing ? "transform 0.6s linear" : "none",
            }}
          >
            ↻
          </span>
        </button>
        <button
          onClick={onSearchPress}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          aria-label="Search"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="7.5" cy="7.5" r="5.5" stroke="#6B6A65" strokeWidth="1.5" />
            <line x1="11.5" y1="11.5" x2="16" y2="16" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={onProfilePress}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "#1A1A1E",
            border: "1px solid #1E1E22",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
          aria-label="Profile"
        >
          <span
            style={{
              fontSize: 12,
              color: "#6B6A65",
              fontFamily: "system-ui, sans-serif",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            PN
          </span>
        </button>
      </div>
    </div>
  );
}
