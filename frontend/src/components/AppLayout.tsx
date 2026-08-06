import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "./NavBar";
import GlobalFooter from "./GlobalFooter";
import { COLOR, FONT, SPACE, CONTENT_WIDTH, COOL, LINE, type ContentWidth } from "../lib/designTokens";

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface Props {
  breadcrumbs?: BreadcrumbItem[];
  children: ReactNode;
  // Content column width token — READING / STANDARD / WIDE. No numeric escape
  // hatch: a surface picks a token, never a raw number. Defaults to STANDARD.
  width?: ContentWidth;
  // Opt-in KOL search in the surface header: when BOTH are provided, the header
  // renders the SearchBar. Pages that omit them are unchanged.
  currentTaId?: string;
  onSearchSelect?: (hcpId: string, taId: string) => void;
  // Immersive surfaces (SkyView) float the bar over a full-bleed fixed canvas:
  // translucent backdrop, and the bar lifted above the canvas's z-index.
  navTranslucent?: boolean;
}

export default function AppLayout({
  breadcrumbs,
  children,
  width = "standard",
  currentTaId,
  onSearchSelect,
  navTranslucent = false,
}: Props) {
  const maxWidth = CONTENT_WIDTH[width];
  const navigate = useNavigate();

  return (
    <div
      style={{
        backgroundColor: COLOR.ground,
        minHeight: "100vh",
        fontFamily: FONT.sans,
      }}
    >
      {/* NavBar is self-centering (2026-07-31): it centers its own content at
          CONTENT_WIDTH.standard inside a full-bleed seam, identical on every
          surface — so it mounts ABOVE the page's width wrapper. Wrapping it in
          the per-page maxWidth would clamp it (the double-wrap problem). */}
      {/* Search rides in the bar (right-aligned), forwarded from the page's TA id
          + select handler; absent where no TA. */}
      {navTranslucent ? (
        <div style={{ position: "relative", zIndex: 6 }}>
          <NavBar currentTaId={currentTaId} onSearchSelect={onSearchSelect} translucent />
        </div>
      ) : (
        <NavBar currentTaId={currentTaId} onSearchSelect={onSearchSelect} />
      )}
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ padding: SPACE.lg }}>

        {breadcrumbs && breadcrumbs.length > 0 ? (
          // Register breadcrumb (2026-08-05): mono uppercase with slash
          // separators — a breadcrumb is structure, and the register's
          // structural vocabulary is mono caps everywhere (eyebrows, column
          // heads, section labels). Replaces the old sans + chevron, the last
          // old-generation element in AppLayout; propagates to every surface
          // that passes the prop.
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: FONT.mono,
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: COOL.label,
              marginTop: 16,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {breadcrumbs.map((crumb, index) => (
              <span
                key={`${crumb.label}-${index}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
              >
                {crumb.path ? (
                  <button
                    type="button"
                    className="fm-pill-button"
                    onClick={() => navigate(crumb.path as string)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      letterSpacing: "inherit",
                      textTransform: "inherit",
                      color: COOL.muted,
                      cursor: "pointer",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = COOL.ui;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = COOL.muted;
                    }}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span style={{ color: COOL.muted }}>{crumb.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? (
                  <span style={{ color: LINE.l2 }}>/</span>
                ) : null}
              </span>
            ))}
          </nav>
        ) : null}

        {children}

          <GlobalFooter />
        </div>
      </div>
    </div>
  );
}
