// The new top-level navigation bar — Design frame 1e.
//
// SCOPE: this bar renders on the asset routes ONLY. The rest of the app keeps its
// existing chrome until the supervised global rollout. Links that point at existing
// surfaces work; they just land on pages still wearing the old chrome, which is
// expected and temporary. Targets live in NAV_ITEMS so the rollout can repoint
// them in one place. "Assets" is the new fourth axis; nothing else moves.
//
// Mobile (≤767px): the wordmark stays fixed and the links become a single
// horizontally scrollable strip — never wrapping onto a second line. Desktop is
// unchanged.

import { Link } from "react-router-dom";
import { COLOR, FONT } from "../../lib/designTokens";
import { useMediaQuery } from "../../lib/useMediaQuery";

type AssetNavKey = "assets";

interface NavItem {
  label: string;
  to: string;
  key?: AssetNavKey;
}

// Nearest working target for each axis. Bibliography has no global surface yet —
// it lands on the feed until the rollout gives it one. Adjust here, not inline.
const NAV_ITEMS: NavItem[] = [
  { label: "Territory", to: "/me" },
  { label: "Cohorts", to: "/oncology/established/nsclc" },
  { label: "Assets", to: "/assets", key: "assets" },
  { label: "Congresses", to: "/congress" },
  { label: "Bibliography", to: "/" },
  { label: "Pulse", to: "/pulse" },
];

export default function AssetNav({ active }: { active?: AssetNavKey }) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 14 : 26,
        minHeight: 46,
        padding: isMobile ? "0 16px" : "0 24px",
        borderBottom: `1px solid ${COLOR.hairStrong}`,
        backgroundColor: COLOR.ground,
        // Desktop wraps only in the (never-hit) overflow case; mobile never wraps.
        flexWrap: isMobile ? "nowrap" : "wrap",
      }}
      aria-label="Primary"
    >
      <Link
        to="/assets"
        style={{
          fontFamily: FONT.mono,
          fontWeight: 500,
          fontSize: 12,
          letterSpacing: "0.18em",
          color: COLOR.amber,
          textDecoration: "none",
          lineHeight: 1,
          flex: "none",
        }}
      >
        FIELDMARK
      </Link>
      <div
        style={{
          display: "flex",
          gap: isMobile ? 18 : 20,
          // Mobile: one scrollable strip, links never wrap; desktop unchanged.
          flexWrap: isMobile ? "nowrap" : "wrap",
          overflowX: isMobile ? "auto" : "visible",
          WebkitOverflowScrolling: "touch",
          minWidth: 0,
          flex: isMobile ? 1 : "0 1 auto",
          paddingBottom: isMobile ? 0 : undefined,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = item.key != null && item.key === active;
          return (
            <Link
              key={item.label}
              to={item.to}
              style={{
                fontFamily: FONT.sans,
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? COLOR.ink1 : COLOR.ink3,
                textDecoration: "none",
                paddingBottom: 14,
                marginBottom: -15,
                borderBottom: isActive ? `1px solid ${COLOR.amber}` : "1px solid transparent",
                lineHeight: 1,
                whiteSpace: "nowrap",
                flex: "none",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = COLOR.ink1;
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = COLOR.ink3;
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
