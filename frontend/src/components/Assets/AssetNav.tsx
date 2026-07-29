// The new top-level navigation bar — Design frame 1e.
//
// SCOPE: this bar renders on the asset routes ONLY. The rest of the app keeps its
// existing chrome until the supervised global rollout. Links that point at existing
// surfaces work; they just land on pages still wearing the old chrome, which is
// expected and temporary. Targets live in NAV_ITEMS so the rollout can repoint
// them in one place. "Assets" is the new fourth axis; nothing else moves.

import { Link } from "react-router-dom";
import { COLOR, FONT } from "../../lib/designTokens";

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
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 26,
        height: 46,
        padding: "0 24px",
        borderBottom: `1px solid ${COLOR.hairStrong}`,
        backgroundColor: COLOR.ground,
        flexWrap: "wrap",
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
        }}
      >
        FIELDMARK
      </Link>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
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
