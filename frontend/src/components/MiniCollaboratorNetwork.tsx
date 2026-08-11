// TOP COLLABORATORS rows — The Record v2 frame treatment (2026-08-10): dim
// rank numeral · name + cohort chip with the papers link at the row's edge ·
// institution beneath. The frame's warm palette is re-inked to the app's
// register; its gold EST chip is NOT adopted — cohort chip hues are semantic
// (EST muted green, RS violet, per the cohort-colour decision) and stay.
import { useMediaQuery } from "../lib/useMediaQuery";
import { useNavigate } from "react-router-dom";
import { buildHcpDetailPath } from "../lib/routeSlugs";
import type { TopCollaborator } from "../lib/api";

interface MiniCollaboratorNetworkProps {
  hcpName: string;
  hcpId?: string;
  collaborators: TopCollaborator[];
}

export default function MiniCollaboratorNetwork({
  hcpId,
  collaborators,
}: MiniCollaboratorNetworkProps) {
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint
  const navigate = useNavigate();

  if (!collaborators || collaborators.length === 0) return null;

  const top5 = collaborators.slice(0, 5);
  const monoFace = "'IBM Plex Mono', ui-monospace, monospace";

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {top5.map((c, i) => (
        <button
          key={c.hcp_id}
          type="button"
          onClick={() => navigate(buildHcpDetailPath(c.hcp_id))}
          style={{
            display: "grid",
            gridTemplateColumns: "30px 1fr",
            gap: 14,
            background: "transparent",
            border: "none",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            padding: "9px 0 10px",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#15131A";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          }}
        >
          <span style={{ fontFamily: monoFace, fontSize: 18, lineHeight: 1, paddingTop: 2, color: "#57534b", fontVariantNumeric: "tabular-nums" }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ display: isMobile ? "flex" : "grid", flexDirection: "column", gridTemplateColumns: "minmax(0,1fr) auto", gap: isMobile ? 3 : 14, alignItems: "baseline" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontSize: 12.5, color: "#E8E6DF", fontWeight: 500, letterSpacing: ".02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                {c.cohort_score !== null && c.cohort_score !== undefined && (() => {
                  const kind = c.cohort_kind ?? "established";
                  const isRisingStar = kind === "rising_star";
                  return (
                    <span
                      style={{
                        // Est chip → muted green (§5); rising → violet (cohort). Tint chips, mono value.
                        fontFamily: monoFace,
                        fontSize: 9.5,
                        fontWeight: 600,
                        color: isRisingStar ? "#B9A6F5" : "#7FB58C",
                        backgroundColor: isRisingStar ? "rgba(155,109,255,0.14)" : "rgba(95,169,126,0.13)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        lineHeight: 1.2,
                        flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {isRisingStar ? "RS" : "EST"} {Math.round(c.cohort_score)}
                    </span>
                  );
                })()}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  // Link → indigo (§5). The shared-paper count is mono (data rule).
                  color: hcpId ? "#8B93F2" : "#9B9892",
                  letterSpacing: ".05em",
                  whiteSpace: "nowrap",
                  cursor: hcpId ? "pointer" : "default",
                  textDecoration: hcpId ? "underline" : "none",
                  textUnderlineOffset: 2,
                  textDecorationColor: "#8B93F255",
                }}
                onClick={(e) => {
                  if (!hcpId) return;
                  e.stopPropagation();
                  navigate(`/hcp/${hcpId}/publications-with/${c.hcp_id}`);
                }}
              >
                <span style={{ fontFamily: monoFace, fontVariantNumeric: "tabular-nums" }}>{c.shared_publications}</span> co-authored papers
              </span>
            </div>
            {c.institution && (
              <span style={{ fontSize: 10, color: "#6B6A65", letterSpacing: ".04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.institution}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
