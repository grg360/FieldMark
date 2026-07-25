import React from "react";
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
  const navigate = useNavigate();

  if (!collaborators || collaborators.length === 0) return null;

  const top5 = collaborators.slice(0, 5);

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {top5.map((c) => (
        <button
          key={c.hcp_id}
          type="button"
          onClick={() => navigate(buildHcpDetailPath(c.hcp_id))}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "transparent",
            border: "none",
            padding: "6px 0",
            borderRadius: 4,
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                color: "#E8E6DF",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
              {c.cohort_score !== null && c.cohort_score !== undefined && (() => {
                const kind = c.cohort_kind ?? "established";
                const isRisingStar = kind === "rising_star";
                return (
                  <span
                    style={{
                      // Est chip → muted green (§5); rising → violet (cohort). Tint chips, mono value.
                      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
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
            </div>
            {c.institution && (
              <div
                style={{
                  fontSize: 9,
                  color: "#6B6A65",
                  marginTop: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.institution}
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              // Link → indigo (§5). The shared-paper count is mono (data rule).
              color: hcpId ? "#8B93F2" : "#9B9892",
              flexShrink: 0,
              marginLeft: 8,
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
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>
              {c.shared_publications}
            </span>{" "}
            co-authored papers
          </div>
        </button>
      ))}
    </div>
  );
}
