import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "./NavBar";
import GlobalFooter from "./GlobalFooter";
import { COLOR, FONT, SPACE, CONTENT_WIDTH, type ContentWidth } from "../lib/designTokens";

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
}

export default function AppLayout({
  breadcrumbs,
  children,
  width = "standard",
  currentTaId,
  onSearchSelect,
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
      {/* NavBar aligns to the content column: it sits inside the same max-width
          container as the content and fills it (width:100%), so its width is the
          column's width on every surface — no per-surface override. Gutters live on
          the content wrapper below, not on the bar. */}
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Search rides in the bar (right-aligned), forwarded from the page's TA id
            + select handler; absent where no TA. */}
        <NavBar currentTaId={currentTaId} onSearchSelect={onSearchSelect} />
        <div style={{ padding: SPACE.lg }}>

        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: COLOR.ink3,
              marginTop: 16,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {breadcrumbs.map((crumb, index) => (
              <span
                key={`${crumb.label}-${index}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
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
                      fontSize: 12,
                      color: COLOR.ink3,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = COLOR.ink1;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = COLOR.ink3;
                    }}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span style={{ color: COLOR.ink1 }}>{crumb.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? (
                  <span style={{ color: COLOR.ink5 }}>{String.fromCharCode(0x203a)}</span>
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
