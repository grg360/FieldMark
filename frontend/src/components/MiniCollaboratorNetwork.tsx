import React from "react";
import { useNavigate } from "react-router-dom";
import { buildHcpDetailPath } from "../lib/routeSlugs";
import type { TopCollaborator } from "../lib/api";

interface MiniCollaboratorNetworkProps {
  hcpName: string;
  collaborators: TopCollaborator[];
}

export default function MiniCollaboratorNetwork({
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
                      fontSize: 9,
                      fontWeight: 600,
                      color: isRisingStar ? "#FFFFFF" : "#0A0A0B",
                      backgroundColor: isRisingStar ? "#9B6DFF" : "#FFD700",
                      padding: "1px 5px",
                      borderRadius: 3,
                      lineHeight: 1.2,
                      flexShrink: 0,
                      fontFeatureSettings: '"tnum"',
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
              color: "#9B9892",
              flexShrink: 0,
              marginLeft: 8,
              fontFeatureSettings: '"tnum"',
            }}
          >
            {c.shared_publications} co-authored papers
          </div>
        </button>
      ))}
    </div>
  );
}
