import React from "react";
import { HCP } from "../data/hcpData";
import { getPublicationsByYearForHcp, type BibliographyPaper } from "../lib/api";

interface BibliographyScreenProps {
  hcp: HCP;
  year: number;
  onBack: () => void;
}

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function PaperCard({ paper }: { paper: BibliographyPaper }) {
  function handleViewAbstract(e: React.MouseEvent) {
    e.stopPropagation();
    if (!paper.pmid) return;
    window.open(`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      style={{
        backgroundColor: "#111113",
        border: "1px solid #1E1E22",
        borderLeft: "3px solid #E8A020",
        borderRadius: 4,
        padding: 12,
        cursor: "default",
      }}
    >
      {/* Row 1: author pill + citations */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          style={{
            backgroundColor: paper.isFirstAuthor ? "#0A1F16" : "#0D0D10",
            border: `1px solid ${paper.isFirstAuthor ? "#1D9E75" : "#1E1E22"}`,
            color: paper.isFirstAuthor ? "#1D9E75" : "#6B6A65",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 3,
            lineHeight: 1.4,
          }}
        >
          {paper.isFirstAuthor ? "First author" : "Co-author"}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
          <span className="fm-bib-citation" style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 500, color: "#E8A020", lineHeight: 1 }}>
            {paper.citations != null ? paper.citations.toLocaleString() : "—"}
          </span>
          <span style={{ fontSize: 10, color: "#6B6A65", lineHeight: 1, marginBottom: 1 }}>citations</span>
        </div>
      </div>

      {/* Row 2: title */}
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          color: "#E8E6DF",
          fontWeight: 500,
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {paper.title}
      </div>

      {/* Row 3: journal + co-authors */}
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>
        {paper.journal ? <span style={{ color: "#E8A020" }}>{paper.journal}</span> : null}
        {paper.journal && paper.coAuthors ? <span style={{ color: "#3A3A3F" }}> · </span> : null}
        {paper.coAuthors ? <span style={{ color: "#6B6A65" }}>{paper.coAuthors}</span> : null}
      </div>

      {/* Row 4: PMID + view abstract */}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#3A3A3F" }}>
          {paper.pmid ? `PMID ${paper.pmid}` : "—"}
        </span>
        <button
          onClick={handleViewAbstract}
          disabled={!paper.pmid}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 11,
            color: paper.pmid ? "#6B6A65" : "#3A3A3F",
            cursor: paper.pmid ? "pointer" : "default",
          }}
        >
          View abstract →
        </button>
      </div>
    </div>
  );
}

export default function BibliographyScreen({ hcp, year, onBack }: BibliographyScreenProps) {
  const [papers, setPapers] = React.useState<BibliographyPaper[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const targetId = hcp.hcp_id ?? hcp.id ?? "";
    if (!targetId) {
      setPapers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const data = await getPublicationsByYearForHcp(String(targetId), year);
      if (cancelled) return;
      setPapers(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id, year]);

  return (
    <div className="fm-screen" style={{ backgroundColor: "#0A0A0B", minHeight: "100dvh", maxWidth: 480, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Nav bar */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            padding: 4,
          }}
        >
          <BackArrow />
          <span style={{ fontSize: 13, color: "#6B6A65" }}>{hcp.name}</span>
        </button>

        <span
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: 500,
            color: "#E8A020",
          }}
        >
          {year}
        </span>

        <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B6A65" }}>
          {loading ? "loading..." : `${papers.length} papers`}
        </span>
      </div>

      <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* Section header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 16px 8px",
          }}
        >
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65" }}>
            Publications
          </span>
          <span style={{ fontSize: 11, color: "#3A3A3F" }}>sorted by citations</span>
        </div>

        {/* Paper cards */}
        {loading ? (
          <div className="fm-bib-grid" style={{ padding: "0 16px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: "#111113",
                  border: "1px solid #1E1E22",
                  borderLeft: "3px solid #1E1E22",
                  borderRadius: 4,
                  padding: 12,
                  height: 110,
                }}
              />
            ))}
          </div>
        ) : papers.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#6B6A65" }}>
            No publications for {year}.
          </div>
        ) : (
          <div className="fm-bib-grid" style={{ padding: "0 16px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
            {papers.map((paper) => (
              <PaperCard key={paper.id} paper={paper} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
