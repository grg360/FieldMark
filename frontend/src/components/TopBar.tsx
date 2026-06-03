import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchBar from "./SearchBar";

interface TopBarProps {
  onLogoPress?: () => void;
  onSearchPress?: () => void;
  onProfilePress?: () => void;
  onRefreshPress?: () => void;
  onScoringExplainedPress?: () => void;
  refreshing?: boolean;
  currentTaId?: string;
  onSearchSelect?: (hcpId: string, taId: string) => void;
}

export default function TopBar({
  onLogoPress,
  onSearchPress,
  onProfilePress,
  onRefreshPress,
  onScoringExplainedPress,
  refreshing,
  currentTaId,
  onSearchSelect,
}: TopBarProps) {
  const navigate = useNavigate();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [logoHover, setLogoHover] = useState(false);

  function handleSearchToggle() {
    setIsSearchOpen((open) => !open);
    onSearchPress?.();
  }

  function handleSearchClose() {
    setIsSearchOpen(false);
  }

  function handleSearchSelect(hcpId: string, taId: string) {
    setIsSearchOpen(false);
    onSearchSelect?.(hcpId, taId);
  }

  return (
    <>
    <div
      className="fm-topbar flex items-center justify-between px-4"
      style={{
        height: 48,
        borderBottom: "1px solid #1E1E22",
        backgroundColor: "#0A0A0B",
      }}
    >
      <button
        type="button"
        onClick={() => {
          onLogoPress?.();
          navigate("/");
        }}
        onMouseEnter={() => setLogoHover(true)}
        onMouseLeave={() => setLogoHover(false)}
        className="fm-logo"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: onLogoPress ? "pointer" : "default",
          fontSize: 20,
          fontWeight: 700,
          color: logoHover && onLogoPress ? "#F5D060" : "#E8A020",
          opacity: logoHover && onLogoPress ? 0.92 : 1,
          fontFamily: "system-ui, sans-serif",
          minHeight: 0,
          lineHeight: 1,
          letterSpacing: "0.06em",
          transition: "color 0.15s ease, opacity 0.15s ease",
        }}
        aria-label="Return to home"
      >
        FIELDMARK
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onScoringExplainedPress ? (
          <button
            type="button"
            onClick={onScoringExplainedPress}
            title="Scoring methodology"
            aria-label="Scoring methodology"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 2px",
              fontSize: 11,
              fontWeight: 500,
              color: "#6B6A65",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontFamily: "system-ui, sans-serif",
              whiteSpace: "nowrap",
              minHeight: 0,
            }}
          >
            How scoring works
          </button>
        ) : null}
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
          onClick={handleSearchToggle}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          aria-label="Search"
          aria-expanded={isSearchOpen}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="7.5" cy="7.5" r="5.5" stroke="#6B6A65" strokeWidth="1.5" />
            <line x1="11.5" y1="11.5" x2="16" y2="16" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={onProfilePress}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            backgroundColor: "#1A1A1E",
            border: "1px solid #1E1E22",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            overflow: "hidden",
          }}
          aria-label="Profile"
        >
          {avatarFailed ? (
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
          ) : (
            <img
              src="/avatars/demo-user.jpg"
              alt="User avatar"
              width={36}
              height={36}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                objectFit: "cover",
                display: "block",
              }}
              onError={() => setAvatarFailed(true)}
            />
          )}
        </button>
      </div>
    </div>
    {isSearchOpen && currentTaId && onSearchSelect ? (
      <SearchBar
        isOpen={isSearchOpen}
        currentTaId={currentTaId}
        onClose={handleSearchClose}
        onSelect={handleSearchSelect}
      />
    ) : null}
    </>
  );
}
