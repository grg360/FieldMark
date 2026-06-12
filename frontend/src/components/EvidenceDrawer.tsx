import { useEffect, useState } from "react";
import {
  getEvidenceForTheme,
  type AuthorRole,
  type EvidencePaper,
} from "../lib/scientificPositions";
import { useIsDesktop } from "../lib/useIsDesktop";

interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  themeName: string;
  themeSummary: string;
  positionIds: string[];
}

function formatAuthorRole(role: AuthorRole): string {
  switch (role) {
    case "first_author":
      return "First Author";
    case "senior_author":
      return "Senior Author";
    case "co_first_author":
      return "Co-First Author";
    case "co_senior_author":
      return "Co-Senior Author";
    default:
      return role;
  }
}

function formatPaperHeader(paper: EvidencePaper): string {
  const bullet = String.fromCharCode(8226);
  const year = paper.pub_year != null ? String(paper.pub_year) : "n/a";
  const journal = paper.journal?.trim() || "Unknown journal";
  const role = formatAuthorRole(paper.author_role);
  return `${year} ${bullet} ${journal} ${bullet} ${role}`;
}

export default function EvidenceDrawer({
  open,
  onClose,
  themeName,
  themeSummary,
  positionIds,
}: EvidenceDrawerProps) {
  const isDesktop = useIsDesktop(768);
  const [loading, setLoading] = useState(false);
  const [papers, setPapers] = useState<EvidencePaper[]>([]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || positionIds.length === 0) {
      setPapers([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getEvidenceForTheme(positionIds)
      .then((data) => {
        if (!cancelled) setPapers(data);
      })
      .catch((err) => {
        console.warn("EvidenceDrawer: load error", err);
        if (!cancelled) setPapers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, positionIds]);

  if (!open) return null;

  const drawerWidth = isDesktop ? 480 : "100%";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence for ${themeName}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: drawerWidth,
          maxWidth: "100%",
          backgroundColor: "#0D0D10",
          borderLeft: "1px solid #1E1E22",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            padding: "20px 20px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#E8E6DF", lineHeight: 1.3 }}>
              {themeName}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#9B9892",
                fontStyle: "italic",
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              {themeSummary}
            </div>
          </div>
          <button
            type="button"
            className="fm-pill-button"
            onClick={onClose}
            aria-label="Close evidence drawer"
            style={{
              background: "none",
              border: "none",
              color: "#6B6A65",
              fontSize: 22,
              cursor: "pointer",
              lineHeight: 1,
              padding: 4,
              flexShrink: 0,
            }}
          >
            {String.fromCharCode(0x00D7)}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "#6B6A65", padding: "24px 0", textAlign: "center" }}>
              Loading evidence...
            </div>
          ) : papers.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6B6A65", padding: "24px 0", textAlign: "center" }}>
              No evidence positions found.
            </div>
          ) : (
            papers.map((paper, paperIdx) => (
              <div
                key={paper.publication_id}
                style={{
                  paddingBottom: 16,
                  marginBottom: 16,
                  borderBottom: paperIdx < papers.length - 1 ? "1px solid #1E1E22" : "none",
                }}
              >
                <div style={{ fontSize: 12, color: "#9B9892", marginBottom: 6 }}>
                  {formatPaperHeader(paper)}
                </div>
                {paper.pub_title ? (
                  <div style={{ fontSize: 13, color: "#6B6A65", marginBottom: 12, lineHeight: 1.4 }}>
                    {paper.pub_title}
                  </div>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {paper.positions.map((position) => (
                    <div key={position.position_id}>
                      <div style={{ fontSize: 13, color: "#E8E6DF", lineHeight: 1.5 }}>
                        {position.position_text}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6B6A65",
                          fontStyle: "italic",
                          marginTop: 6,
                          marginLeft: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        &quot;{position.evidence_excerpt}&quot;
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
