// The new top-level navigation bar — Design frame 1e (desktop) + Mobile Nav frame
// 1a "Cell grid · floating marker" (≤767px).
//
// SCOPE: this bar renders on the asset routes ONLY. Links that point at existing
// surfaces work; they just land on pages still wearing the old chrome, which is
// expected and temporary. Targets live in NAV_ITEMS so the rollout can repoint
// them in one place. "Assets" is the new fourth axis; nothing else moves.
//
// Mobile (≤767px): a 3×2 cell grid on a 1px rule grid — equal cells with shared
// seams so it reads as a matrix, not a wrapped row. All six items visible with full
// labels, no icons, no scrolling, no interaction to reveal. Active = 2px amber cap
// rule + lifted cell fill + brighter label. Replaces the old horizontal scroll
// strip entirely. Desktop (≥768px) is unchanged.

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

// Seam colour for the rule grid — the 1px gaps between opaque cells reveal it.
const SEAM = COLOR.hairStrong;

export default function AssetNav({ active }: { active?: AssetNavKey }) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  if (isMobile) {
    return (
      <nav aria-label="Primary">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: SEAM,
            borderBottom: `1px solid ${SEAM}`,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = item.key != null && item.key === active;
            return (
              <Link
                key={item.label}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: 53,
                  padding: "0 11px",
                  background: isActive ? COLOR.surfaceRaised : COLOR.ground,
                  boxShadow: isActive ? `inset 0 2px 0 ${COLOR.amber}` : "none",
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 11.5,
                    lineHeight: 1.2,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: isActive ? COLOR.ink1 : COLOR.ink3,
                    fontWeight: isActive ? 500 : 400,
                    overflowWrap: "anywhere",
                    hyphens: "auto",
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  // Desktop (≥768px) — unchanged: wordmark + inline links.
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 26,
        minHeight: 46,
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
          flex: "none",
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
                whiteSpace: "nowrap",
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
