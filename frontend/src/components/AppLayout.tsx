import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "./TopBar";
import GlobalFooter from "./GlobalFooter";
import { COLOR, FONT, SPACE } from "../lib/designTokens";

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface Props {
  breadcrumbs?: BreadcrumbItem[];
  children: ReactNode;
  maxWidth?: number;
  // Opt-in KOL search: when BOTH are provided, TopBar renders the SearchBar.
  // Pages that omit them (settings, watchlists, institutions) are unchanged.
  currentTaId?: string;
  onSearchSelect?: (hcpId: string, taId: string) => void;
}

export default function AppLayout({
  breadcrumbs,
  children,
  maxWidth = 960,
  currentTaId,
  onSearchSelect,
}: Props) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        backgroundColor: COLOR.ground,
        minHeight: "100vh",
        fontFamily: FONT.sans,
      }}
    >
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          padding: SPACE.lg,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <TopBar
          onLogoPress={() => navigate("/me")}
          currentTaId={currentTaId}
          onSearchSelect={onSearchSelect}
        />

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
  );
}
