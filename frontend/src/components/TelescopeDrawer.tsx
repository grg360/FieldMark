import { useMemo, type CSSProperties } from "react";
import nodesData from "../data/telescope_nsclc_nodes.json";
import edgesData from "../data/telescope_nsclc_edges.json";

export interface TelescopeDrawerProps {
  hcp: {
    id: string;
    name: string;
    institution: string;
    cohort: string;
    rank: number;
    score: number;
  } | null;
  onClose: () => void;
  onViewProfile: (hcpId: string) => void;
  onSelectCollaborator: (collab: {
    id: string;
    name: string;
    institution: string;
    cohort: string;
    rank: number;
    score: number;
  }) => void;
}

function getCohortBadge(
  hcp: { id: string; cohort: string },
  topTenEstablishedIds: Set<string>,
  topHundredRisingIds: Set<string>
): { label: string; style: CSSProperties } {
  if (hcp.cohort === "established" && topTenEstablishedIds.has(hcp.id)) {
    return {
      label: "Top KOL",
      style: {
        background: "rgba(255, 252, 240, 0.15)",
        color: "#FFFFFF",
        border: "1px solid rgba(255, 252, 240, 0.3)",
      },
    };
  }
  if (hcp.cohort === "established") {
    return {
      label: "Established",
      style: {
        background: "rgba(255, 215, 0, 0.15)",
        color: "#FFD700",
        border: "1px solid rgba(255, 215, 0, 0.3)",
      },
    };
  }
  if (hcp.cohort === "rising" && topHundredRisingIds.has(hcp.id)) {
    return {
      label: "Top Rising Star",
      style: {
        background: "rgba(197, 153, 255, 0.15)",
        color: "#C599FF",
        border: "1px solid rgba(197, 153, 255, 0.3)",
      },
    };
  }
  return {
    label: "Rising Star",
    style: {
      background: "rgba(155, 109, 255, 0.15)",
      color: "#9B6DFF",
      border: "1px solid rgba(155, 109, 255, 0.3)",
    },
  };
}

export default function TelescopeDrawer({
  hcp,
  onClose,
  onViewProfile,
  onSelectCollaborator,
}: TelescopeDrawerProps) {
  const { topTenEstablishedIds, topHundredRisingIds } = useMemo(() => {
    const established = nodesData
      .filter((n: { cohort: string }) => n.cohort === "established")
      .sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
    const topTen = new Set(established.slice(0, 10).map((n: { id: string }) => n.id));

    const rising = nodesData
      .filter((n: { cohort: string }) => n.cohort === "rising")
      .sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
    const topHundredRising = new Set(rising.slice(0, 100).map((n: { id: string }) => n.id));

    return { topTenEstablishedIds: topTen, topHundredRisingIds: topHundredRising };
  }, []);

  const collaborators = useMemo(() => {
    if (!hcp) return [];

    const relevantEdges = (
      edgesData as Array<{ source: string; target: string; weight: number }>
    ).filter((e) => e.source === hcp.id || e.target === hcp.id);

    const collaboratorMap = new Map<string, number>();
    for (const edge of relevantEdges) {
      const otherId = edge.source === hcp.id ? edge.target : edge.source;
      const currentWeight = collaboratorMap.get(otherId) || 0;
      collaboratorMap.set(otherId, currentWeight + edge.weight);
    }

    const sortedIds = Array.from(collaboratorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const nodesById = new Map(
      (
        nodesData as Array<{
          id: string;
          name: string;
          institution: string;
          cohort: string;
          rank: number;
          score: number;
        }>
      ).map((n) => [n.id, n])
    );

    return sortedIds
      .map(([id, weight]) => {
        const node = nodesById.get(id);
        if (!node) return null;
        return {
          id: node.id,
          name: node.name,
          institution: node.institution,
          cohort: node.cohort,
          rank: node.rank,
          score: node.score,
          weight,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [hcp]);

  if (!hcp) {
    return null;
  }

  const badge = getCohortBadge(hcp, topTenEstablishedIds, topHundredRisingIds);

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          right: 400,
          zIndex: 10,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 400,
          zIndex: 11,
          background: "rgba(13, 13, 16, 0.95)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.12)",
          padding: 24,
          color: "#E8E6DF",
          fontFamily: "system-ui, sans-serif",
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            width: 24,
            height: 24,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "rgba(232, 230, 223, 0.6)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(232, 230, 223, 1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(232, 230, 223, 0.6)";
          }}
        >
          ✕
        </button>

        <span
          style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 999,
            ...badge.style,
          }}
        >
          {badge.label}
        </span>

        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#FFFFFF",
            marginTop: 12,
            marginBottom: 4,
            paddingRight: 32,
          }}
        >
          {hcp.name}
        </div>

        <div
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "rgba(232, 230, 223, 0.7)",
            marginBottom: 24,
          }}
        >
          {hcp.institution}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 4,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "rgba(232, 230, 223, 0.5)",
                marginBottom: 4,
              }}
            >
              Rank
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#FFFFFF" }}>#{hcp.rank}</div>
          </div>
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 4,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "rgba(232, 230, 223, 0.5)",
                marginBottom: 4,
              }}
            >
              Score
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#FFFFFF" }}>
              {hcp.score.toFixed(1)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onViewProfile(hcp.id)}
          style={{
            width: "100%",
            padding: 12,
            background: "rgba(255, 215, 0, 0.1)",
            border: "1px solid rgba(255, 215, 0, 0.3)",
            borderRadius: 4,
            color: "#FFD700",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 215, 0, 0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255, 215, 0, 0.1)";
          }}
        >
          View full profile →
        </button>

        {collaborators.length > 0 && (
          <div style={{ marginTop: "32px" }}>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "rgba(232, 230, 223, 0.5)",
                marginBottom: "12px",
              }}
            >
              Top Collaborators
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {collaborators.map((collab) => {
                let dotColor = "#9B6DFF";
                if (collab.cohort === "established" && collab.rank <= 10) {
                  dotColor = "#FFFCF0";
                } else if (collab.cohort === "established") {
                  dotColor = "#FFD700";
                } else if (collab.cohort === "rising" && collab.rank <= 100) {
                  dotColor = "#C599FF";
                }

                const nameParts = collab.name.trim().split(/\s+/);
                const lastName = nameParts[nameParts.length - 1];

                return (
                  <button
                    key={collab.id}
                    type="button"
                    onClick={() =>
                      onSelectCollaborator({
                        id: collab.id,
                        name: collab.name,
                        institution: collab.institution,
                        cohort: collab.cohort,
                        rank: collab.rank,
                        score: collab.score,
                      })
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "#E8E6DF",
                      fontFamily: "inherit",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.07)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: "13px",
                        }}
                      >
                        {lastName}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "rgba(232, 230, 223, 0.5)",
                        marginLeft: "8px",
                        flexShrink: 0,
                      }}
                    >
                      {collab.weight} papers
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
